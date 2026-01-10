import { Injectable } from "@nestjs/common";
import { Resend } from "resend";

@Injectable()
export class EmailService {
  private resend: Resend;

  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

  async sendEmail(options: {
    to: string | string[];
    subject: string;
    html: string;
    from?: string;
  }) {
    const { data, error } = await this.resend.emails.send({
      from: options.from || process.env.RESEND_FROM_EMAIL!,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }
}
