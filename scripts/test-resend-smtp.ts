import nodemailer from "nodemailer";

async function main() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("Set RESEND_API_KEY env var");
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.resend.com",
    port: 465,
    secure: true,
    auth: {
      user: "resend",
      pass: apiKey,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: "onboarding@resend.dev",
      to: "cap9886@gmail.com",
      subject: "ClearCost SMTP Test",
      text: "If you see this, Resend SMTP is working.",
    });
    console.log("Email sent successfully:", info.messageId);
  } catch (err) {
    console.error("SMTP failed:", err);
  }
}

main();
