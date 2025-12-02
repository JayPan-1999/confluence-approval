import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Text, Button, Inline, Modal, ModalTransition, ModalBody, ModalHeader, ModalFooter, ModalTitle, Stack } from '@forge/react';
import { invoke, view } from '@forge/bridge';

const App = () => {
  const [approvalResult, setApprovalResult] = useState(null);
  const [loading, setLoading] = useState(null); // 'approve' | 'reject' | null
  const [isModalOpen, setIsModalOpen] = useState(false);

  const trigger = async (type) => {
    setLoading(type);
    try {
      const ctx = await view.getContext();
      const contentId = ctx?.extension?.content?.id || ctx?.contentId;
      const res = await invoke(type, { contentId });
      setApprovalResult(res);
      setIsModalOpen(true);
    } finally {
      setLoading(null);
    }
  };

  return (
    <>
      <Inline space="space.100">
        <Stack alignInline="start">
          <Button onClick={() => trigger('approve')} disabled={!!loading} appearance="primary">
            {loading === 'approve' ? 'Submitting...' : 'Approval'}
          </Button>
        </Stack>
        <Stack alignInline="start">
          <Button onClick={() => trigger('reject')} disabled={!!loading} appearance="warning">
            {loading === 'reject' ? 'Submitting...' : 'Reject'}
          </Button>
        </Stack>
      </Inline>
      {approvalResult && (
        <ModalTransition>
          {isModalOpen && (
            <Modal onClose={() => setIsModalOpen(false)}>
              <ModalHeader>
                <ModalTitle>Response</ModalTitle>
              </ModalHeader>
              <ModalBody>
                <Text>{approvalResult.status === 'success' ? '✅ ' : '❌ '} {approvalResult.message}</Text>
              </ModalBody>
              <ModalFooter>
                <Button onClick={() => setIsModalOpen(false)} appearance="primary">Close</Button>
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
