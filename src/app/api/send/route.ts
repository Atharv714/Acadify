import { EmailTemplate } from "../../../components/email-template";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST() {
  try {
    const { data, error } = await resend.emails.send({
      from: "Magnifi <testmagnifi@magnifi.space>",
      to: ["atharvrastogi714@gmail.com", "demon.work02@gmail.com"],
      subject: "Welcome to Magnifi",
      react: EmailTemplate({ firstName: "Aditya" }),
    });

    if (error) {
      return Response.json({ error }, { status: 500 });
    }

    return Response.json(data);
  } catch (error) {
    return Response.json({ error }, { status: 500 });
  }
}

// d1.work02@gmail.com
