const nodemailer = require('nodemailer');

module.exports = async (req, res) =>{
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { subject, content, sender, senderName, sender_name, sendemame } = req.body || req.query || {};

  if (!subject || !content) {
    return res.status(400).json({ error: '缺少 subject 或 content 参数' });
  }

  const displayName = sender || senderName || sender_name || sendemame || 'AI Companion';

  const transporter = nodemailer.createTransport({
    host: 'smtp.qq.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.QQ_EMAIL,
      pass: process.env.QQ_AUTH_CODE
    }
  });

  try {
    const info = await transporter.sendMail({
      from: `"${displayName}" <${process.env.QQ_EMAIL}>`,
      to: process.env.TO_EMAIL || process.env.QQ_EMAIL,
      subject: subject,
      text: content
    });

    return res.status(200).json({ success: true, messageId: info.messageId });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

文件 3：api/check_mail.js
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const client = new ImapFlow({
    host: 'imap.qq.com',
    port: 993,
    secure: true,
    auth: {
      user: process.env.QQ_EMAIL,
      pass: process.env.QQ_AUTH_CODE
    },
    logger: false
  });

  try {
    await client.connect();
    let lock = await client.getMailboxLock('INBOX');
    let messages = [];

    try {
      // 1. 检索收件箱里的未读邮件 (unseen)
      let searchResult = await client.search({ unseen: true });
      
      if (searchResult && searchResult.length > 0) {
        // 取最新发来的最多 3 封未读邮件
        let targetSeq = searchResult.slice(-3);
        let range = targetSeq.join(',');

        for await (let message of client.fetch(range, { envelope: true, source: true })) {
          let parsed = await simpleParser(message.source);
          messages.push({
            subject: message.envelope.subject || '无主题',
            from: message.envelope.from?.[0]?.address || '未知发件人',
            date: message.envelope.date,
            content: (parsed.text || '（无文字正文）').trim().slice(0, 500)
          });
        }
        messages.reverse();

        // 2. 读取后自动将这些邮件标记为已读 (\Seen)
        await client.messageFlagsAdd(range, ['\\Seen']);
      }
    } finally {
      lock.release();
    }

    await client.logout();

    // 3. 如果没有未读邮件，明确告知 AI
    if (messages.length === 0) {
      return res.status(200).json({ 
        success: true, 
        count: 0, 
        emails: [], 
        notice: "当前没有收到新的未读邮件（之前的邮件已阅读过，对方尚未回复）。" 
      });
    }

    return res.status(200).json({ success: true, count: messages.length, emails: messages });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
