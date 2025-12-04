import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';

const resolver = new Resolver();

resolver.define('getText', (req) => {
  console.log(req);

  return 'Hello, world!';
});

// 抽取公共函数，避免重复逻辑
const sendDecision = async (buttonType, contentId) => {
  const body = { buttonType, pageId: `${contentId}` };

  const apiKey = process.env.CFT_WEBHOOK_API_KEY;

  if (!contentId) {
    return { status: 'error', message: 'No content ID provided' };
  }
  try {
    const response = await api.fetch('https://api-private.atlassian.com/automation/webhooks/confluence/a/66beaf2d-43a2-414a-8f27-a14cabb863ba/019ac40f-8124-78ed-a230-e0178911e5f6', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Automation-Webhook-Token': apiKey
      },
      body: JSON.stringify(body)
    });

    if (response.status === 200) {
      return { status: 'success', message: `${buttonType} request sent successfully!` };
    } else {
      const errorText = await response.text();
      console.error('Webhook request failed:', response.status, errorText);
      return { status: 'error', message: `Request failed with status ${response.status}` };
    }
  } catch (error) {
    console.error('Error sending webhook request:', error);
    return { status: 'error', message: 'Failed to send request' };
  }
};

// approve 按钮触发
resolver.define('approve', async ({ payload }) => {
  const { contentId } = payload || {};
  return sendDecision('approve', contentId);
});

// 新增 reject 按钮触发
resolver.define('reject', async ({ payload }) => {
  const { contentId } = payload || {};
  return sendDecision('reject', contentId);
});

// 新增 re-review 按钮触发
resolver.define('re-review', async ({ payload }) => {
  const { contentId } = payload || {};
  return sendDecision('re-review', contentId);
});

export const handler = resolver.getDefinitions();
