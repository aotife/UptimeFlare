const pageConfig = {
  // 您的状态页面标题
  title: "lyc8503的状态页面",
  // 显示在状态页面标题处的链接，可以将 `highlight` 设置为 `true`
  links: [
    { link: 'https://home.chjina.com', label: 'Home' },
    { link: 'https://chjina.com', label: 'Blog' },
  ],
}

const workerConfig = {
  // 最多每 3 分钟写入 KV，除非状态发生变化。
  kvWriteCooldownMinutes: 3,
  // 在这里定义所有您的监视器
  monitors: [
    // 示例 HTTP 监视器
    {
      // `id` 应唯一，如果 `id` 保持不变，则会保留历史记录
      id: 'foo_monitor',
      // `name` 在状态页面和回调消息中使用
      name: '我的Blog',
      // `method` 应为有效的 HTTP 方法
      method: 'POST',
      // `target` 是有效的 URL
      target: 'https://chjina.com',
      // [可选] `tooltip` 仅在状态页面上显示工具提示
      tooltip: '这是此监视器的工具提示',
      // [可选] `statusPageLink` 仅用于状态页面上的可点击链接
      statusPageLink: 'https://chjina.com',
      // [可选] `expectedCodes` 是可接受的 HTTP 响应代码的数组，如果未指定，则默认为 2xx
      expectedCodes: [200],
      // [可选] `timeout` 单位为毫秒，如果未指定，则默认为 10000
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
      target: 'dns.chjina.com:1688',
      tooltip: 'KMS',
      statusPageLink: 'https://chjina.com/kms',
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

// 以下是发送 Telegram 和 Bark 通知的代码
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
    ? `服务在停机 ${downtimeDuration} 分钟后恢复正常。`
    : `服务在 ${timeIncidentStartFormatted} 发生故障。问题：${reason || '未指定'}`;

  console.log('通知：', monitor.name, statusText);

  if (env.BARK_SERVER && env.BARK_DEVICE_KEY) {
    try {
      let title = isUp ? `✅ ${monitor.name} 再次正常！` : `🔴 ${monitor.name} 当前不可用。`;
      await sendBarkNotification(env, monitor, title, statusText);
    } catch (error) {
      console.error('发送 Bark 通知时出错：', error);
    }
  }

  if (env.SECRET_TELEGRAM_CHAT_ID && env.SECRET_TELEGRAM_API_TOKEN) {
    try {
      let operationalLabel = isUp ? '正常' : '不正常';
      let statusEmoji = isUp ? '✅' : '🔴';
      let telegramText = `*${escapeMarkdown(
        monitor.name,
      )}* 目前 *${operationalLabel}*\n${statusEmoji} ${escapeMarkdown(statusText)}`;
      await notifyTelegram(env, monitor, isUp, telegramText);
    } catch (error) {
      console.error('发送 Telegram 通知时出错：', error);
    }
  }
}

export async function notifyTelegram(env: any, monitor: any, operational: boolean, text: string) {
  const chatId = env.SECRET_TELEGRAM_CHAT_ID;
  const apiToken =
