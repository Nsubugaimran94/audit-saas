import { processPaymentCredit } from './credit-payment.js'

export default async function handler(req, res) {
    const orderTrackingId = req.query.OrderTrackingId

    if (orderTrackingId) {
        try {
            await processPaymentCredit(orderTrackingId)
        } catch (err) {
            console.error('IPN credit processing failed:', err)
        }
    }

    return res.status(200).json({
        orderNotificationType: 'IPNCHANGE',
        orderTrackingId: req.query.OrderTrackingId,
        orderMerchantReference: req.query.OrderMerchantReference,
        status: 200
    })
}
