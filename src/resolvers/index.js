import Resolver from "@forge/resolver";
import api, { route } from "@forge/api";
import { States_Enum } from "../constant/index.js";

const resolver = new Resolver();

const isTransientNetworkError = (error) => {
    const message = error?.message || "";
    const causeCode = error?.cause?.code || "";

    return (
        causeCode === "ECONNRESET" ||
        causeCode === "ETIMEDOUT" ||
        causeCode === "ECONNREFUSED" ||
        message.includes("fetch failed")
    );
};

const isAuthenticationScopeError = (error) => {
    const message = error?.message || "";

    return (
        error?.status === 401 &&
        (error?.serviceKey === "atlassian-token-service-key" ||
            message.includes("NEEDS_AUTHENTICATION_ERR") ||
            message.includes("Authentication Required"))
    );
};

const requestConfluenceWithRetry = async (
    requestFactory,
    label,
    maxAttempts = 3,
) => {
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await requestFactory();
        } catch (error) {
            lastError = error;

            if (!isTransientNetworkError(error) || attempt === maxAttempts) {
                break;
            }

            console.warn(
                `${label} transient failure, retrying ${attempt}/${maxAttempts}:`,
                error?.cause?.code || error?.message || error,
            );
        }
    }

    throw lastError;
};

// 抽取公共函数，避免重复逻辑
const sendDecision = async (
    buttonType,
    contentId,
    spaceKey,
    originState,
    authorName,
    pageUrl,
) => {
    const body = {
        pageId: `${contentId}`,
        spaceKey,
        buttonType,
        originState,
        authorName,
        pageUrl,
    };

    const apiKey = process.env.CFT_WEBHOOK_API_KEY;

    if (!contentId) {
        return { status: "error", message: "No content ID provided" };
    }
    try {
        const response = await api.fetch(
            "https://api-private.atlassian.com/automation/webhooks/confluence/a/66beaf2d-43a2-414a-8f27-a14cabb863ba/019ac40f-8124-78ed-a230-e0178911e5f6",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Automation-Webhook-Token": apiKey,
                },
                body: JSON.stringify(body),
            },
        );

        if (response.status === 200) {
            return {
                status: "success",
                message: `${buttonType} request sent successfully!`,
            };
        } else {
            const errorText = await response.text();
            console.error(
                "Webhook request failed:",
                response.status,
                errorText,
            );
            return {
                status: "error",
                message: `Request failed with status ${response.status}`,
            };
        }
    } catch (error) {
        console.error("Error sending webhook request:", error);
        return { status: "error", message: "Failed to send request" };
    }
};

// approve 按钮触发
resolver.define("approve", async ({ payload, context }) => {
    const { contentId, spaceKey, pageUrl } = payload || {};
    const { data } = await getPageStatus(contentId);
    const originState = data?.contentState?.name;
    const curState = handleStatusChange(originState, "approve")?.newStatus;
    const accountId = context?.accountId;
    const { displayName: authorName } = await getCurrentUser(accountId);
    await changePageStatus({
        payload: {
            pageId: contentId,
            spaceKey,
            curState,
            buttonType: "approve",
        },
    });
    return sendDecision(
        "approve",
        contentId,
        spaceKey,
        originState,
        authorName,
        pageUrl,
    );
});

// 获取当前状态
resolver.define("getCurState", async ({ payload }) => {
    const { contentId } = payload || {};
    const { data } = await getPageStatus(contentId);
    return data?.contentState?.name || null;
});

// 新增 reject 按钮触发
resolver.define("reject", async ({ payload, context }) => {
    const { contentId, spaceKey, pageUrl, rejectComment } = payload || {};
    const { data } = await getPageStatus(contentId);
    const originState = data?.contentState?.name;
    const curState = handleStatusChange(originState, "reject")?.newStatus;
    const accountId = context?.accountId;
    const actor = await getCurrentUser(accountId);
    await changePageStatus({
        payload: {
            pageId: contentId,
            spaceKey,
            curState,
            buttonType: "reject",
        },
    });

    let versionCommentResult = { status: "success" };

    // 如果有拒绝理由，更新页面版本备注以在 version history 中显示
    if (rejectComment) {
        versionCommentResult = await addVersionComment(
            contentId,
            rejectComment,
            actor,
        );
    }

    const decisionResult = await sendDecision(
        "reject",
        contentId,
        spaceKey,
        originState,
        actor.displayName,
        pageUrl,
    );

    if (versionCommentResult.status === "error") {
        return {
            ...decisionResult,
            status: "error",
            message: `Reject succeeded, but version history comment was not written: ${versionCommentResult.message}`,
        };
    }

    return decisionResult;
});

// 获取当前操作者的信息。
// 这里使用 asApp，避免 Guest 用户因为没有页面编辑权限而无法查询自己的资料。
const getCurrentUser = async (accountId) => {
    const fallbackUser = {
        displayName: "Unknown user",
        accountId: accountId || "unknown",
    };

    if (!accountId) {
        return fallbackUser;
    }

    const res = await requestConfluenceWithRetry(
        () =>
            api
                .asApp()
                .requestConfluence(
                    route`/wiki/rest/api/user?accountId=${accountId}&expand=details`,
                ),
        "getCurrentUser",
    );
    if (!res.ok) {
        console.warn(
            `Failed to get user profile: ${res.status} ${res.statusText}`,
        );
        return fallbackUser;
    }

    const user = await res.json();
    return {
        displayName:
            user.displayName || user.publicName || fallbackUser.displayName,
        accountId: user.accountId || accountId,
    };
};

// 新增 re-review 按钮触发
resolver.define("re-review", async ({ payload, context }) => {
    const { contentId, spaceKey, pageUrl } = payload || {};
    const { data } = await getPageStatus(contentId);
    const originState = data?.contentState?.name;
    const curState = handleStatusChange(originState, "re-review")?.newStatus;
    const accountId = context?.accountId;
    const { displayName: authorName } = await getCurrentUser(accountId);
    await changePageStatus({
        payload: {
            pageId: contentId,
            spaceKey,
            curState,
            buttonType: "re-review",
        },
    });
    return sendDecision(
        "re-review",
        contentId,
        spaceKey,
        originState,
        authorName,
        pageUrl,
    );
});

/**
 * 将拒绝理由写入页面版本历史（Version History）
 * 通过 PUT 更新页面内容并设置 version.message 来实现
 * Confluence 的 version history 会记录每次内容变更时的 version.message
 *
 * @param {string} pageId - 页面 ID
 * @param {string} rejectComment - 拒绝理由
 * @param {{displayName: string, accountId: string}} actor - 实际执行操作的用户
 */
const addVersionComment = async (pageId, rejectComment, actor) => {
    try {
        const actorName = actor?.displayName || "Unknown user";
        const actorAccountId = actor?.accountId || "unknown";
        const versionMessage = `[Rejected by ${actorName} | accountId: ${actorAccountId}] ${rejectComment}`;

        // 先走 v1 content 接口。老页面这条链路通常更稳。
        const v1GetRes = await requestConfluenceWithRetry(
            () =>
                api
                    .asApp()
                    .requestConfluence(
                        route`/wiki/rest/api/content/${pageId}?expand=body.storage,version,space,ancestors`,
                    ),
            "addVersionComment.v1.get",
        );

        if (v1GetRes.ok) {
            const page = await v1GetRes.json();
            const currentVersion = page.version?.number || 1;
            const pageTitle = page.title;
            const spaceKey = page.space?.key;
            const status = page.status;
            const ancestors = page.ancestors || [];
            const bodyValue = page.body?.storage?.value ?? "<p></p>";

            const v1PutRes = await requestConfluenceWithRetry(
                () =>
                    api
                        .asApp()
                        .requestConfluence(
                            route`/wiki/rest/api/content/${pageId}`,
                            {
                                method: "PUT",
                                headers: {
                                    "Content-Type": "application/json",
                                    Accept: "application/json",
                                },
                                body: JSON.stringify({
                                    id: pageId,
                                    type: page.type || "page",
                                    status,
                                    title: pageTitle,
                                    space: {
                                        key: spaceKey,
                                    },
                                    ancestors: ancestors.map((ancestor) => ({
                                        id: ancestor.id,
                                    })),
                                    body: {
                                        storage: {
                                            value: bodyValue,
                                            representation: "storage",
                                        },
                                    },
                                    version: {
                                        number: currentVersion + 1,
                                        message: versionMessage,
                                    },
                                }),
                            },
                        ),
                "addVersionComment.v1.put",
            );

            if (!v1PutRes.ok) {
                const errorText = await v1PutRes.text();
                console.error(
                    "Failed to add version comment via v1:",
                    v1PutRes.status,
                    errorText,
                );
                return {
                    status: "error",
                    message: `update page failed with status ${v1PutRes.status}`,
                };
            }

            const updatedPage = await v1PutRes.json();
            if (updatedPage?.version?.message !== versionMessage) {
                console.error(
                    "Version comment mismatch after v1 update:",
                    updatedPage?.version?.message,
                );
                return {
                    status: "error",
                    message: "Confluence did not persist the version message",
                };
            }

            console.log(
                `Version comment added successfully via v1 for page ${pageId}`,
            );
            return { status: "success" };
        }

        const v1ErrorText = await v1GetRes.text();

        // 410 Gone 一般说明当前对象不是传统 content v1 能读取的页面，
        // 比如 live page。这里回退到 v2 page 接口。
        if (v1GetRes.status !== 410) {
            console.error(
                "Failed to get page for version comment via v1:",
                v1GetRes.status,
                v1ErrorText,
            );
            return {
                status: "error",
                message: `load page failed with status ${v1GetRes.status}`,
            };
        }

        const v2GetRes = await requestConfluenceWithRetry(
            () =>
                api
                    .asApp()
                    .requestConfluence(
                        route`/wiki/api/v2/pages/${pageId}?body-format=storage&include-version=true`,
                    ),
            "addVersionComment.v2.get",
        );

        if (!v2GetRes.ok) {
            const errorText = await v2GetRes.text();
            console.error(
                "Failed to get page for version comment via v2:",
                v2GetRes.status,
                errorText,
            );
            return {
                status: "error",
                message: `load page via v2 failed with status ${v2GetRes.status}`,
            };
        }

        const page = await v2GetRes.json();
        const currentVersion = page.version?.number || 1;
        const bodyValue = page.body?.storage?.value ?? "<p></p>";

        const v2PutRes = await requestConfluenceWithRetry(
            () =>
                api
                    .asApp()
                    .requestConfluence(route`/wiki/api/v2/pages/${pageId}`, {
                        method: "PUT",
                        headers: {
                            "Content-Type": "application/json",
                            Accept: "application/json",
                        },
                        body: JSON.stringify({
                            id: pageId,
                            status: page.status,
                            title: page.title,
                            spaceId: page.spaceId,
                            parentId: page.parentId,
                            ownerId: page.ownerId,
                            subtype: page.subtype,
                            body: {
                                representation: "storage",
                                value: bodyValue,
                            },
                            version: {
                                number: currentVersion + 1,
                                message: versionMessage,
                            },
                        }),
                    }),
            "addVersionComment.v2.put",
        );

        if (!v2PutRes.ok) {
            const errorText = await v2PutRes.text();
            console.error(
                "Failed to add version comment via v2:",
                v2PutRes.status,
                errorText,
            );
            return {
                status: "error",
                message: `update page via v2 failed with status ${v2PutRes.status}`,
            };
        }

        const updatedPage = await v2PutRes.json();
        if (updatedPage?.version?.message !== versionMessage) {
            console.error(
                "Version comment mismatch after v2 update:",
                updatedPage?.version?.message,
            );
            return {
                status: "error",
                message: "Confluence did not persist the version message",
            };
        }

        console.log(
            `Version comment added successfully via v2 for page ${pageId}`,
        );
        return { status: "success" };
    } catch (error) {
        console.error("Error adding version comment:", error);

        if (isAuthenticationScopeError(error)) {
            return {
                status: "error",
                message:
                    "missing granted page scopes for the current installation; deploy the app and run forge install --upgrade for this environment before retrying",
            };
        }

        return { status: "error", message: "request failed" };
    }
};

const getAllPageStates = async (spaceKey) => {
    if (!spaceKey) {
        return { status: "error", message: "spaceKey is required" };
    }
    try {
        const res = await requestConfluenceWithRetry(
            () =>
                api
                    .asApp()
                    .requestConfluence(
                        route`/wiki/rest/api/space/${spaceKey}/state/settings`,
                    ),
            "getAllPageStates",
        );

        if (!res.ok) {
            const text = await res.text();
            console.error("getAllPageStates failed:", res.status, text);
            return { status: "error", message: `http ${res.status}` };
        }
        const data = await res.json();
        return { status: "success", data };
    } catch (e) {
        console.error("getAllPageStates error:", e);
        return { status: "error", message: "request failed" };
    }
};

const getPageStatus = async (pageId) => {
    try {
        const res = await requestConfluenceWithRetry(
            () =>
                api
                    .asApp()
                    .requestConfluence(
                        route`/wiki/rest/api/content/${pageId}/state`,
                    ),
            "getPageStatus",
        );

        if (!res.ok) {
            const text = await res.text();
            console.error("getPageStatus failed:", res.status, text);
            return { status: "error", message: `http ${res.status}` };
        }
        const data = await res.json();
        return { status: "success", data };
    } catch (e) {
        console.error("getPageStatus error:", e);
        return { status: "error", message: "request failed" };
    }
};

const changePageStatus = async ({ payload }) => {
    const { pageId, curState, spaceKey, buttonType } = payload || {};
    try {
        const { data: newData } = await getAllPageStates(spaceKey);
        const { spaceContentStates } = newData || {};
        const id = spaceContentStates.find(
            (state) => state.name.toLowerCase() === curState.toLowerCase(),
        )?.id;
        const res = await requestConfluenceWithRetry(
            () =>
                api
                    .asApp()
                    .requestConfluence(
                        route`/wiki/rest/api/content/${pageId}/state?status=current`,
                        {
                            method: "PUT",
                            headers: {
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                                id,
                            }),
                        },
                    ),
            "changePageStatus",
        );

        if (!res.ok) {
            const text = await res.text();
            console.error("putPageStates failed:", res.status, text);
            return { status: "error", message: `http ${res.status}` };
        }
        const data = await res.json();
        return {
            status: "success",
            data,
            message: `${buttonType} request sent successfully!`,
        };
    } catch (e) {
        console.error("putPageStates error:", e);
        return { status: "error", message: "request failed" };
    }
};

const handleStatusChange = (currentStatus, action) => {
    // 根据当前状态 + 操作，匹配新状态
    if (action === "re-review") {
        return {
            success: true,
            newStatus: States_Enum.PENDING_ITL_REVIEW,
        };
    }
    if (action === "reject") {
        return {
            success: true,
            newStatus: States_Enum.DRAFT,
        };
    }
    if (action === "approve") {
        switch (currentStatus) {
            case States_Enum.DRAFT:
                return {
                    success: true,
                    newStatus: States_Enum.PENDING_ITL_REVIEW,
                };
            case States_Enum.PENDING_ITL_REVIEW:
                // ITL审核通过，进入待BU审核
                return {
                    success: true,
                    newStatus: States_Enum.PENDING_BU_REVIEW,
                };
            case States_Enum.PENDING_BU_REVIEW:
                // BU审核通过，发布
                return {
                    success: true,
                    newStatus: States_Enum.PUBLISHED,
                };
            case States_Enum.PUBLISHED:
                return {
                    success: false,
                };
            // 未定义状态兜底
            default:
                return {
                    success: false,
                };
        }
    }
};
export const handler = resolver.getDefinitions();
