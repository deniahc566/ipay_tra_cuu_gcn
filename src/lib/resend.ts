import nodemailer from "nodemailer";

// Singleton — reuse the SMTP connection across warm invocations.
// In development the transporter is null and OTPs are logged to console instead.
const transporter =
  process.env.NODE_ENV === "production"
    ? nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD,
        },
      })
    : null;

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  if (!transporter) {
    console.log(`[DEV OTP] ${to} → ${otp}`);
    return;
  }

  const { rejected } = await transporter.sendMail({
    from: `"iPay GCN" <${process.env.GMAIL_USER}>`,
    to,
    subject: "Mã OTP đăng nhập iPay GCN",
    html: `
      <div style="font-family:sans-serif;max-width:420px;margin:auto;padding:24px">
        <div style="background:linear-gradient(135deg,#012082,#00538E);padding:20px 24px;border-radius:8px 8px 0 0">
          <h2 style="color:#fff;margin:0;font-size:18px">Tra cứu GCN Bảo hiểm iPay</h2>
        </div>
        <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <p style="color:#334155;margin-top:0">Mã OTP đăng nhập của bạn là:</p>
          <div style="font-size:36px;font-weight:700;letter-spacing:10px;color:#012082;
                      padding:16px;background:#f0f4ff;border-radius:8px;text-align:center;margin:16px 0">
            ${otp}
          </div>
          <p style="color:#64748b;font-size:13px;margin-bottom:0">
            Mã có hiệu lực trong <strong>10 phút</strong>. Không chia sẻ mã này với ai.
          </p>
        </div>
      </div>
    `,
  });

  if (rejected.length > 0) {
    throw new Error(`Gmail rejected recipients: ${rejected.join(", ")}`);
  }
}
