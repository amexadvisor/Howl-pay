export default async function handler(req, res) {
  const { userId } = req.query;

  if (!userId || userId === 'guest_user') {
    return res.status(400).json({ error: 'Valid Telegram userId required' });
  }

  const BOT_TOKEN = process.env.BOT_TOKEN;
  
  // The usernames of your channels
  const channels = [
    { id: '@howlnotification', key: 'howlnotification' },
    { id: '@howlnews', key: 'howlnews' },
    { id: '@howl_community', key: 'howl_community' }
  ];

  try {
    const results = await Promise.all(
      channels.map(async (channel) => {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${channel.id}&user_id=${userId}`;
        const response = await fetch(url);
        const data = await response.json();
        
        let joined = false;
        // Status indicates membership: creator, administrator, or member
        if (data.ok && ['member', 'administrator', 'creator'].includes(data.result.status)) {
          joined = true;
        }

        return { key: channel.key, joined };
      })
    );

    const allJoined = results.every(r => r.joined);
    return res.status(200).json({ results, allJoined });

  } catch (error) {
    return res.status(500).json({ error: 'Server error checking membership' });
  }
}
