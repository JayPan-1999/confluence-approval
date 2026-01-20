import React, { useEffect, useState } from "react";
import ForgeReconciler, {
    Text,
    Button,
    Inline,
    Modal,
    ModalTransition,
    ModalBody,
    ModalHeader,
    ModalFooter,
    ModalTitle,
    Stack,
} from "@forge/react";
import { invoke, view } from "@forge/bridge";
import { States_Enum } from "../constant/index.js";

const App = () => {
    const [approvalResult, setApprovalResult] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [pendingAction, setPendingAction] = useState(null); // 'approve' | 'reject' | 're-review' | null

    const [isRereviewDisabled, setIsRereviewDisabled] = useState(true);
    const [isApprovalDisabled, setIsApprovalDisabled] = useState(true);
    const [isRejectDisabled, setIsRejectDisabled] = useState(true);

    const [isEditing, setIsEditing] = useState(true);
    const [i18n, setI18n] = useState({});

    // 简单的国际化词典
    const messages = {
        en: {
            approve: "Approve",
            reject: "Reject",
            submitting: "Submitting...",
            responseTitle: "Response",
            close: "Close",
            confirmTitleApprove: "Confirm approval",
            confirmTitleReject: "Confirm rejection",
            confirmTitleReReview: "Confirm Submit for Internal Review",
            confirmTextApprove: "Are you sure you want to approve this page?",
            confirmTextReReview:
                "Are you sure you want to request a Submit for Internal Review for this page?",
            confirmTextReject: "Are you sure you want to reject this page?",
            confirm: "Confirm",
            cancel: "Cancel",
        },
        "zh-CN": {
            approve: "同意",
            reject: "拒绝",
            submitting: "提交中...",
            responseTitle: "结果",
            close: "关闭",
            confirmTitleApprove: "确认通过",
            confirmTitleReject: "确认拒绝",
            confirmTitleReReview: "确认重新审核",
            confirmTextApprove: "确定要通过该页面吗？",
            confirmTextReReview: "确定要请求重新审核该页面吗？",
            confirmTextReject: "确定要拒绝该页面吗？",
            confirm: "确认",
            cancel: "取消",
        },
    };

    useEffect(() => {
        (async () => {
            const ctx = await view.getContext();
            const locale = ctx?.locale || ctx?.user?.locale || "en";
            const langKey = locale.startsWith("zh") ? "zh-CN" : "en";
            setI18n(messages[langKey]);
            await initCurState();
        })();
    }, []);

    const triggerWithConfirm = async (type) => {
        setPendingAction(type);
        setConfirmOpen(true);
    };

    const executeAction = async () => {
        if (!pendingAction) return;
        setConfirmOpen(false);
        try {
            const ctx = await view.getContext();
            const contentId = ctx?.extension?.content?.id || ctx?.contentId;
            const spaceKey = ctx?.extension?.space?.key;
            const res = await invoke(pendingAction, { contentId, spaceKey });
            setApprovalResult(res);
            setIsModalOpen(true);
        } finally {
            setPendingAction(null);
        }
    };

    const initCurState = async () => {
        const ctx = await view.getContext();
        const contentId = ctx?.extension?.content?.id || ctx?.contentId;
        setIsEditing(ctx?.extension?.isEditing);
        const res = await invoke("getCurState", { contentId });
        setIsRejectDisabled(
            [States_Enum.DRAFT, States_Enum.PUBLISHED].includes(res),
        );
        setIsRereviewDisabled(
            [
                States_Enum.PENDING_ITL_REVIEW,
                States_Enum.PENDING_BU_REVIEW,
            ].includes(res),
        );
        setIsApprovalDisabled(
            [States_Enum.DRAFT, States_Enum.PUBLISHED].includes(res),
        );
    };

    return (
        <>
            <Inline space="space.100" spread="space-between">
                <Stack alignInline="start">
                    {/* <Button
                        onClick={() => triggerWithConfirm("re-review")}
                        isDisabled={isEditing || isRereviewDisabled}
                        appearance="warning"
                    >
                        {pendingAction === "re-review"
                            ? i18n.submitting || "Submitting..."
                            : i18n.reReview || "Submit for Internal Review"}
                    </Button> */}
                </Stack>
                <Stack alignInline="start">
                    <Inline space="space.100">
                        <Stack>
                            <Button
                                onClick={() => {
                                    triggerWithConfirm("approve");
                                }}
                                isDisabled={isEditing || isApprovalDisabled}
                                appearance="primary"
                            >
                                {pendingAction === "approve"
                                    ? i18n.submitting || "Submitting..."
                                    : i18n.approve || "Approval"}
                            </Button>
                        </Stack>
                        <Stack>
                            <Button
                                onClick={() => triggerWithConfirm("reject")}
                                isDisabled={isEditing || isRejectDisabled}
                                appearance="danger"
                            >
                                {pendingAction === "reject"
                                    ? i18n.submitting || "Submitting..."
                                    : i18n.reject || "Reject"}
                            </Button>
                        </Stack>
                    </Inline>
                </Stack>
            </Inline>
            {/* 二次确认弹窗 */}
            <ModalTransition>
                {confirmOpen && (
                    <Modal onClose={() => setConfirmOpen(false)}>
                        <ModalHeader>
                            <ModalTitle>
                                {pendingAction === "approve"
                                    ? i18n.confirmTitleApprove ||
                                      "Confirm approval"
                                    : pendingAction === "reject"
                                      ? i18n.confirmTitleReject ||
                                        "Confirm rejection"
                                      : i18n.confirmTitleReReview ||
                                        "Confirm Submit for Internal Review"}
                            </ModalTitle>
                        </ModalHeader>
                        <ModalBody>
                            <Text>
                                {pendingAction === "approve"
                                    ? i18n.confirmTextApprove ||
                                      "Are you sure you want to approve this page?"
                                    : pendingAction === "reject"
                                      ? i18n.confirmTextReject ||
                                        "Are you sure you want to reject this page?"
                                      : i18n.confirmTextReReview ||
                                        "Are you sure you want to request a Submit for Internal Review for this page?"}
                            </Text>
                        </ModalBody>
                        <ModalFooter>
                            <Button onClick={() => setConfirmOpen(false)}>
                                {i18n.cancel || "Cancel"}
                            </Button>
                            <Button
                                appearance="primary"
                                onClick={executeAction}
                            >
                                {i18n.confirm || "Confirm"}
                            </Button>
                        </ModalFooter>
                    </Modal>
                )}
            </ModalTransition>

            {/* 结果弹窗 */}
            {approvalResult && (
                <ModalTransition>
                    {isModalOpen && (
                        <Modal onClose={() => setIsModalOpen(false)}>
                            <ModalHeader>
                                <ModalTitle>
                                    {i18n.responseTitle || "Response"}
                                </ModalTitle>
                            </ModalHeader>
                            <ModalBody>
                                <Text>
                                    {approvalResult.status === "success"
                                        ? "✅ "
                                        : "❌ "}{" "}
                                    {approvalResult.message}
                                </Text>
                            </ModalBody>
                            <ModalFooter>
                                <Button
                                    onClick={() => setIsModalOpen(false)}
                                    appearance="primary"
                                >
                                    {i18n.close || "Close"}
                                </Button>
                            </ModalFooter>
                        </Modal>
                    )}
                </ModalTransition>
            )}
        </>
    );
};

ForgeReconciler.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);
