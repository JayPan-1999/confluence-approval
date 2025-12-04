import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Text, Button, Inline, Modal, ModalTransition, ModalBody, ModalHeader, ModalFooter, ModalTitle, Stack } from '@forge/react';
import { invoke, view } from '@forge/bridge';

const App = () => {
  const [approvalResult, setApprovalResult] = useState(null);
  const [loading, setLoading] = useState(null); // 'approve' | 'reject' | null
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // 'approve' | 'reject' | 're-review' | null
  const [i18n, setI18n] = useState({});

  // 简单的国际化词典
  const messages = {
    'en': {
      approve: 'Approval',
      reject: 'Reject',
      submitting: 'Submitting...',
      responseTitle: 'Response',
      close: 'Close',
      confirmTitleApprove: 'Confirm approval',
      confirmTitleReject: 'Confirm rejection',
      confirmTitleReReview: 'Confirm re-review',
      confirmTextApprove: 'Are you sure you want to approve this page?',
      confirmTextReReview: 'Are you sure you want to request a re-review for this page?',
      confirmTextReject: 'Are you sure you want to reject this page?',
      confirm: 'Confirm',
      cancel: 'Cancel'
    },
    'zh-CN': {
      approve: '同意',
      reject: '拒绝',
      submitting: '提交中...',
      responseTitle: '结果',
      close: '关闭',
      confirmTitleApprove: '确认通过',
      confirmTitleReject: '确认拒绝',
      confirmTitleReReview: '确认重新审核',
      confirmTextApprove: '确定要通过该页面吗？',
      confirmTextReReview: '确定要请求重新审核该页面吗？',
      confirmTextReject: '确定要拒绝该页面吗？',
      confirm: '确认',
      cancel: '取消'
    }
  };

  useEffect(() => {
    (async () => {
      const ctx = await view.getContext();
      const locale = ctx?.locale || ctx?.user?.locale || 'en';
      const langKey = locale.startsWith('zh') ? 'zh-CN' : 'en';
      setI18n(messages[langKey]);
    })();
  }, []);

  const triggerWithConfirm = async (type) => {
    setPendingAction(type);
    setConfirmOpen(true);
  };

  const executeAction = async () => {
    if (!pendingAction) return;
    setConfirmOpen(false);
    setLoading(pendingAction);
    try {
      const ctx = await view.getContext();
      const contentId = ctx?.extension?.content?.id || ctx?.contentId;
      const res = await invoke(pendingAction, { contentId });
      setApprovalResult(res);
      setIsModalOpen(true);
    } finally {
      setLoading(null);
      setPendingAction(null);
    }
  };

  return (
    <>
      <Inline space="space.100">
        <Stack alignInline="start">
          <Button onClick={() => triggerWithConfirm('approve')} disabled={!!loading} appearance="primary">
            {loading === 'approve' ? i18n.submitting || 'Submitting...' : i18n.approve || 'Approval'}
          </Button>
        </Stack>
        <Stack alignInline="start">
          <Button onClick={() => triggerWithConfirm('reject')} disabled={!!loading} appearance="danger">
            {loading === 'reject' ? i18n.submitting || 'Submitting...' : i18n.reject || 'Reject'}
          </Button>
        </Stack>
        <Stack alignInline="start">
          <Button onClick={() => triggerWithConfirm('re-review')} disabled={!!loading} appearance="warning">
            {loading === 're-review' ? i18n.submitting || 'Submitting...' : i18n.reReview || 'Re-review'}
          </Button>
        </Stack>
      </Inline>

      {/* 二次确认弹窗 */}
      <ModalTransition>
        {confirmOpen && (
          <Modal onClose={() => setConfirmOpen(false)}>
            <ModalHeader>
              <ModalTitle>
                {pendingAction === 'approve' ? (i18n.confirmTitleApprove || 'Confirm approval') : (pendingAction === 'reject' ? (i18n.confirmTitleReject || 'Confirm rejection') : (i18n.confirmTitleReReview || 'Confirm re-review'))}
              </ModalTitle>
            </ModalHeader>
            <ModalBody>
              <Text>
                {pendingAction === 'approve' ? (i18n.confirmTextApprove || 'Are you sure you want to approve this page?') : (pendingAction === 'reject' ? (i18n.confirmTextReject || 'Are you sure you want to reject this page?') : (i18n.confirmTextReReview || 'Are you sure you want to request a re-review for this page?'))}
              </Text>
            </ModalBody>
            <ModalFooter>
              <Button onClick={() => setConfirmOpen(false)}>{i18n.cancel || 'Cancel'}</Button>
              <Button appearance="primary" onClick={executeAction}>{i18n.confirm || 'Confirm'}</Button>
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
                <ModalTitle>{i18n.responseTitle || 'Response'}</ModalTitle>
              </ModalHeader>
              <ModalBody>
                <Text>{approvalResult.status === 'success' ? '✅ ' : '❌ '} {approvalResult.message}</Text>
              </ModalBody>
              <ModalFooter>
                <Button onClick={() => setIsModalOpen(false)} appearance="primary">{i18n.close || 'Close'}</Button>
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
  </React.StrictMode>
);
