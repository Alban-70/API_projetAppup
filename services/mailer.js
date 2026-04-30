const SibApiV3Sdk = require("sib-api-v3-sdk");

async function sendEmail({ email, subject, content }) {
  const client = SibApiV3Sdk.ApiClient.instance;
  client.authentications["api-key"].apiKey = process.env.BREVO_API_KEY;

  const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
  await apiInstance
    .sendTransacEmail({
      sender: { email: process.env.BREVO_EMAIL, name: process.env.BREVO_NAME },
      to: [{ email }],
      subject,
      htmlContent: content,
    })
    .then((data) => console.log("Email sent:", data))
    .catch((err) => console.error("Email error:", err));
}

module.exports = { sendEmail };
