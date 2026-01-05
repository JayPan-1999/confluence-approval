import Resolver from "@forge/resolver";
import api, { route } from "@forge/api";
import { States_Enum } from "../constant/index.js";

// const States_Enum = {
//     DRAFT: "Draft",
//     PENDING_ITL_REVIEW: "Pending JSC Review",
//     PENDING_BU_REVIEW: "Pending BU Review",
//     PUBLISHED: "Published",
// };

const resolver = new Resolver();

// 抽取公共函数，避免重复逻辑
const sendDecision = async (buttonType, contentId, spaceKey) => {
    const body = { pageId: `${contentId}`, spaceKey, buttonType };

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
            }
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
                errorText
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
resolver.define("approve", async ({ payload }) => {
    const { contentId, spaceKey } = payload || {};
    const { data } = await getPageStatus(contentId);
    const curState = handleStatusChange(
        data?.contentState?.name,
        "approve"
    )?.newStatus;
    await changePageStatus({
        payload: {
            pageId: contentId,
            spaceKey,
            curState,
            buttonType: "approve",
        },
    });
    return sendDecision("approve", contentId, spaceKey);
});

// 获取当前状态
resolver.define("getCurState", async ({ payload }) => {
    const { contentId } = payload || {};
    const { data } = await getPageStatus(contentId);
    return data?.contentState?.name || null;
});

// 新增 reject 按钮触发
resolver.define("reject", async ({ payload }) => {
    const { contentId, spaceKey } = payload || {};
    const { data } = await getPageStatus(contentId);
    const curState = handleStatusChange(
        data?.contentState?.name,
        "reject"
    )?.newStatus;
    await changePageStatus({
        payload: {
            pageId: contentId,
            spaceKey,
            curState,
            buttonType: "reject",
        },
    });
    return sendDecision("reject", contentId, spaceKey);
});

// 新增 re-review 按钮触发
resolver.define("re-review", async ({ payload }) => {
    const { contentId, spaceKey } = payload || {};
    const { data } = await getPageStatus(contentId);
    const curState = handleStatusChange(
        data?.contentState?.name,
        "re-review"
    )?.newStatus;
    await changePageStatus({
        payload: {
            pageId: contentId,
            spaceKey,
            curState,
            buttonType: "re-review",
        },
    });
    return sendDecision("re-review", contentId, spaceKey);
});

const getAllPageStates = async (spaceKey) => {
    if (!spaceKey) {
        return { status: "error", message: "spaceKey is required" };
    }
    try {
        const res = await api
            .asUser()
            .requestConfluence(
                route`/wiki/rest/api/space/${spaceKey}/state/settings`
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
        const res = await api
            .asUser()
            .requestConfluence(route`/wiki/rest/api/content/${pageId}/state`);

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
            (state) => state.name.toLowerCase() === curState.toLowerCase()
        )?.id;
        const res = await api
            .asUser()
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
                }
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
