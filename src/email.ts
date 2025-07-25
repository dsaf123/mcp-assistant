import { Resend } from 'resend';

export async function sendEmail(resend: Resend, fromEmail: string, toEmail: string, subject: string, body: string) {
    const { data, error } = await resend.emails.send({
        from: fromEmail,
        to: toEmail,
        subject: subject,
        html: body
    });

    if (error) {
        console.error(error);
        return { success: false, error: error };
    }

    return { success: true, data: data };
}