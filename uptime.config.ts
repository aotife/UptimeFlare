const pageConfig = {
  // 状态页面的标题
  title: "lyc8503的状态页面",
  // 在状态页面标题处显示的链接，可以将 `highlight` 设置为 `true`
  links: [
    { link: 'https://github.com/lyc8503', label: 'GitHub' },
    { link: 'https://blog.lyc8503.site/', label: '博客' },
    { link: 'mailto:me@lyc8503.site', label: '给我发邮件', highlight: true },
  ],
}

const workerConfig = {
  // 除非状态发生变化，最多每 3 分钟写入 KV。
  kvWriteCooldownMinutes: 3,
  // 在此定义所有监视器
  monitors: [
    // 示例 HTTP 监视器
    {
      // `id` 应唯一，如果 `id` 保持不变，则会保留历史记录
      id: 'foo_monitor',
      // `name` 用于状态页面和回调消息
      name: '我的 API 监视器',
      // `method` 应为有效的 HTTP 方法
      method: 'POST',
      // `target` 是有效的 URL
      target: 'https://example.com',
      // [可选] `tooltip` 仅在状态页面上显示工具提示
      tooltip: '这是此监视器的工具提示',
      // [可选] `statusPageLink` 仅用于状态页面上的可点击链接
      statusPageLink: 'https://example.com',
      // [可选] `expectedCodes` 是可接受的 HTTP 响应代码的数组，如果未指定，则默认为 2xx
      expectedCodes: [200],
      // [可选] `timeout` 毫秒为单位，如果未指定，则默认为 10000
      timeout: 10000,
      // [可选] 要发送的标头
      headers: {
        'User-Agent': 'Uptimeflare',
        Authorization: 'Bearer YOUR_TOKEN_HERE',
      },
      // [可选] 要发送的主体
      body: 'Hello, world!',
      // [可选] 如果指定，响应必须包含关键字才能被视为正常。
      responseKeyword: 'success',
      // [可选] 如果指定，检查将在您指定的地区运行，
      // 在设置此值之前，请参考文档 https://github.com/lyc8503/UptimeFlare/wiki/Geo-specific-checks-setup
      checkLocationWorkerRoute: 'https://xxx.example.com',
    },
    // 示例 TCP 监视器
    {
      id: 'test_tcp_monitor',
      name: '示例 TCP 监视器',
      // `method` 应为 `TCP_PING`，用于 TCP 监视器
      method: 'TCP_PING',
      // `target` 应为 `host:port`，用于 TCP 监视器
      target: '1.2.3.4:22',
      tooltip: '我的生产服务器 SSH',
      statusPageLink: 'https://example.com',
      timeout: 5000,
    },
  ],
  callbacks: {
    onStatusChange: async (
      env: any,
      monitor: any,
      isUp: boolean,
      timeIncidentStart: number,
      timeNow: number,
      reason: string
    ) => {
      // 当任何监视器的状态发生变化时将调用此回调函数
      // 在这里编写任何 TypeScript 代码

      // 默认情况下，如果正确设置了 Cloudflare 环境变量，每次状态变化时都会发送 Bark 和 Telegram 通知。
      await notify(env, monitor, isUp, timeIncidentStart, timeNow, reason)
    },
    onIncident: async (
      env: any,
      monitor: any,
      timeIncidentStart: number,
      timeNow: number,
      reason: string
    ) => {
      // 如果任何监视器发生正在进行的事件，每分钟都会调用此回调函数
      // 在这里编写任何 TypeScript 代码
    },
  },
}
// 下面是发送 Telegram 和 Bark 通知的代码
// 您可以安全地忽略它们
const escapeMarkdown = (text: string) => {
  return text.replace(/[_*[\](){}~`>#+\-=|.!\\]/g, '\\{{input}}');
};

async function notify(
  env: any,
  monitor: any,
  isUp: boolean,
  timeIncidentStart: number,
  timeNow: number,
  reason: string,
) {
  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Shanghai',
  });

  let downtimeDuration = Math.round((timeNow - timeIncidentStart) / 60);
  const timeIncidentStartFormatted = dateFormatter.format(new Date(timeIncidentStart * 1000));
  let statusText = isUp
      ? `The service is up again after being down for ${downtimeDuration} minutes.`
    : `Service became unavailable at ${timeIncidentStartFormatted}. Issue: ${reason || 'unspecified'}`;

  console.log('Notifying: ', monitor.name, statusText);

  if (env.BARK_SERVER && env.BARK_DEVICE_KEY) {
    try {
      let title = isUp ? `✅ ${monitor.name} is up again!` : `🔴 ${monitor.name} is currently down.`;
      await sendBarkNotification(env, monitor, title, statusText);
    } catch (error) {
      console.error('Error sending Bark notification:', error);
    }
  }

  if (env.SECRET_TELEGRAM_CHAT_ID && env.SECRET_TELEGRAM_API_TOKEN) {
    try {
      let operationalLabel = isUp ? 'Up' : 'Down';
      let statusEmoji = isUp ? '✅' : '🔴';
      let telegramText = `*${escapeMarkdown(
        monitor.name,
      )}* is currently *${operationalLabel}*\n${statusEmoji} ${escapeMarkdown(statusText)}`;
      await notifyTelegram(env, monitor, isUp, telegramText);
    } catch (error) {
      console.error('Error sending Telegram notification:', error);
    }
  }
}

export async function notifyTelegram(env: any, monitor: any, operational: boolean, text: string) {
  const chatId = env.SECRET_TELEGRAM_CHAT_ID;
  const apiToken = env.SECRET_TELEGRAM_API_TOKEN;

  const payload = new URLSearchParams({
    chat_id: chatId,
    parse_mode: 'MarkdownV2',
    text: text,
  });

  try {
    const response = await fetch(`https://api.telegram.org/bot${apiToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: payload.toString(),
    });

    if (!response.ok) {
      console.error(
        `Failed to send Telegram notification "${text}",  ${response.status} ${response.statusText
        } ${await response.text()}`,
      );
    }
  } catch (error) {
    console.error('Error sending Telegram notification:', error);
  }
}

async function sendBarkNotification(env: any, monitor: any, title: string, body: string, group: string = '') {
  const barkServer = env.BARK_SERVER;
  const barkDeviceKey = env.BARK_DEVICE_KEY;
  const barkUrl = `${barkServer}/push`;
  const data = {
    title: title,
    body: body,
    group: group,
    url: monitor.url,
    device_key: barkDeviceKey,
  };

  const response = await fetch(barkUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (response.ok) {
    console.log('Bark notification sent successfully.');
  } else {
    const respText = await response.text();
    console.error('Failed to send Bark notification:', response.status, response.statusText, respText);
  }
}

// Don't forget this, otherwise compilation fails.
export { pageConfig, workerConfig }
