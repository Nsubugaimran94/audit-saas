export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const { email, companyName, client, supplier, totalFlags, criticalCount, highCount, fileName } = req.body

    if (!email) {
        return res.status(400).json({ error: 'email required' })
    }

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: 'AuditLog <onboarding@resend.dev>',
                to: [email],
                subject: `Audit Complete: ${totalFlags} issue(s) found in your statement`,
                html: `
                    <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
                        <div style="background: #0B1F3A; padding: 24px; border-radius: 12px 12px 0 0;">
                            <h1 style="color: white; font-size: 20px; margin: 0;">AuditLog</h1>
                        </div>
                        <div style="padding: 24px; border: 1px solid #E2E8F0; border-top: none; border-radius: 0 0 12px 12px;">
                            <p style="color: #0B1F3A; font-size: 16px;">Hi ${companyName || 'there'},</p>
                            <p style="color: #4A6080; font-size: 14px; line-height: 1.6;">Your audit of <strong>${fileName}</strong> is complete.</p>
                            <div style="background: #F8FAFC; border-radius: 10px; padding: 16px; margin: 16px 0;">
                                <p style="margin: 4px 0; color: #4A6080; font-size: 13px;">Client: ${client}</p>
                                <p style="margin: 4px 0; color: #4A6080; font-size: 13px;">Supplier: ${supplier}</p>
                                <p style="margin: 4px 0; color: #4A6080; font-size: 13px;">Issues found: <strong>${totalFlags}</strong> (${criticalCount} critical, ${highCount} high)</p>
                            </div>
                            <a href="https://audit-saas.vercel.app/history.html" style="display: inline-block; background: #0B1F3A; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px;">View Full Results</a>
                        </div>
                    </div>
                `
            })
        })

        const data = await response.json()

        if (!response.ok) {
            return res.status(response.status).json({ error: data })
        }

        return res.status(200).json({ success: true, id: data.id })

    } catch (error) {
        return res.status(500).json({ error: error.message })
    }
}