// ============================================
// AUDIT LOGIC - NAK Shipping vs White Horse
// ============================================

const RATES = {
    '20FT': { expected: 950, min: 900, max: 1000 },
    '40FT': { expected: 1900, min: 1800, max: 2000 }
}

// Extract container info from PARTICULARS text
// e.g. "10X20FT STC OF IMPORTS" → { count: 10, type: '20FT' }
function extractContainerInfo(particulars) {
    if (!particulars) return null

    const match = particulars.toString().toUpperCase().match(/(\d+)\s*X\s*(20FT|40FT)/)
    if (!match) return null

    return {
        count: parseInt(match[1]),
        type: match[2]
    }
}

// Check if a value is an Excel serial date bug
// Excel serial numbers around 44000-45000 = years 2020-2023
function isExcelSerialDate(value) {
    const num = Number(value)
    return !isNaN(num) && num > 40000 && num < 50000
}

// Convert Excel serial number to real date
function excelSerialToDate(serial) {
    const excelEpoch = new Date(1899, 11, 30)
    const date = new Date(excelEpoch.getTime() + serial * 86400000)
    return date.toISOString().split('T')[0]
}

// Main audit function
function auditStatement(invoices) {
    const flags = []
    const invoiceNumbers = []
    const validInvoiceNumbers = []

    // First pass - collect all valid invoice numbers
    invoices.forEach(row => {
        if (row['INV.NO.'] && row['AMOUNT'] && !row['PAYMENTS']) {
            validInvoiceNumbers.push(row['INV.NO.'].toString().trim())
        }
    })

    // Second pass - run all checks
    invoices.forEach((row, index) => {
        const rowNum = index + 1
        const particulars = row['PARTICULARS'] || ''
        const invNo = row['INV.NO.'] ? row['INV.NO.'].toString().trim() : null
        const amount = parseFloat(row['AMOUNT']) || 0
        const payment = parseFloat(row['PAYMENTS']) || 0
        const date = row['DATE']

        // CHECK 1 - Excel serial date bug
        if (isExcelSerialDate(date)) {
            flags.push({
                row: rowNum,
                inv_no: invNo,
                type: 'INVALID DATE',
                severity: 'HIGH',
                detail: `DATE shows as Excel serial number ${date}. Real date is ${excelSerialToDate(date)}`
            })
        }

        // CHECK 2 - Rate anomaly
        if (amount > 0 && particulars) {
            const container = extractContainerInfo(particulars)
            if (container) {
                const ratePerContainer = amount / container.count
                const expectedRate = RATES[container.type]

                if (expectedRate) {
                    if (ratePerContainer < expectedRate.min || ratePerContainer > expectedRate.max) {
                        flags.push({
                            row: rowNum,
                            inv_no: invNo,
                            type: 'RATE ANOMALY',
                            severity: 'HIGH',
                            detail: `${container.count}X${container.type} charged at $${ratePerContainer.toFixed(2)}/container. Expected $${expectedRate.expected}. Total amount $${amount}`
                        })
                    }
                }
            }
        }

        // CHECK 3 - Duplicate invoice numbers
        if (invNo && amount > 0) {
            if (invoiceNumbers.includes(invNo)) {
                flags.push({
                    row: rowNum,
                    inv_no: invNo,
                    type: 'DUPLICATE INVOICE',
                    severity: 'HIGH',
                    detail: `Invoice ${invNo} appears more than once in the statement`
                })
            } else {
                invoiceNumbers.push(invNo)
            }
        }

        // CHECK 4 - Payment referencing non-existent invoice
        if (payment > 0 && invNo) {
            if (!validInvoiceNumbers.includes(invNo)) {
                flags.push({
                    row: rowNum,
                    inv_no: invNo,
                    type: 'GHOST PAYMENT',
                    severity: 'CRITICAL',
                    detail: `Payment of $${payment} references invoice ${invNo} which does not exist in this statement`
                })
            }
        }
    })

    return {
        total_rows_checked: invoices.length,
        total_flags: flags.length,
        flags: flags
    }
}

async function saveAuditResults(supabaseClient, auditResults, parsedData, fileName, userId) {
    const { data, error } = await supabaseClient
        .from('audit_results')
        .insert([
            {
                client: parsedData.client,
                supplier: parsedData.supplier,
                file_name: fileName,
                rows_checked: auditResults.total_rows_checked,
                total_flags: auditResults.total_flags,
                flags: auditResults.flags,
                created_at: new Date().toISOString(),
                user_id: userId
            }
        ])

    if (error) {
        console.error('Error saving audit results:', error)
    } else {
        console.log('Audit results saved to Supabase')
    }
}              