import { Resend } from 'resend';

export async function sendEmail(resend: Resend, fromEmail: string, toEmail: string, subject: string, text: string, html?: string | null) {
    const { data, error } = await resend.emails.send({
        from: fromEmail,
        to: toEmail,
        subject: subject,
        text: text,
        html: html || undefined
    });

    if (error) {
        console.error(error);
        return { success: false, error: error };
    }

    return { success: true, data: data };
}