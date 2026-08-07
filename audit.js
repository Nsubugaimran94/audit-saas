// ============================================
// AUDIT LOGIC - NAK Shipping vs White Horse
// ============================================

// Calculate expected rates from the actual invoices in the statement
function calculateExpectedRates(invoices) {
    const ratesByType = { '20FT': [], '40FT': [] }

    invoices.forEach(row => {
        const particulars = row['PARTICULARS'] || ''
        const amount = parseFloat(row['AMOUNT']) || 0

        if (amount <= 0) return

        const container = extractContainerInfo(particulars)
        if (container && ratesByType[container.type]) {
            const ratePerContainer = amount / container.count
            ratesByType[container.type].push(ratePerContainer)
        }
    })

    function median(arr) {
        if (arr.length === 0) return null
        const sorted = [...arr].sort((a, b) => a - b)
        const mid = Math.floor(sorted.length / 2)
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
    }

    const rates = {}
    for (const type of Object.keys(ratesByType)) {
        const med = median(ratesByType[type])
        if (med !== null) {
            rates[type] = {
                expected: Math.round(med),
                min: Math.round(med * 0.9),
                max: Math.round(med * 1.1)
            }
        }
    }

    return rates
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

function checkBalanceCarryForward(invoices) {
    const flags = []
    const yearData = {}

    invoices.forEach(row => {
        const dateStr = row['DATE'] || ''
        const yearMatch = dateStr.match(/\/(\d{4})$/)
        if (!yearMatch) return
        const year = yearMatch[1]

        if (!yearData[year]) {
            yearData[year] = { opening: null, totalCharges: 0, totalPayments: 0 }
        }

        const particulars = (row['PARTICULARS'] || '').toString()
        const amount = parseFloat(row['AMOUNT']) || 0
        const payment = parseFloat(row['PAYMENTS']) || 0
        const isOpening = /opp?ening\s*bal/i.test(particulars)

        if (isOpening) {
            yearData[year].opening = amount
        } else {
            yearData[year].totalCharges += amount
            yearData[year].totalPayments += payment
        }
    })

    const years = Object.keys(yearData).sort()

    for (let i = 0; i < years.length - 1; i++) {
        const current = yearData[years[i]]
        const next = yearData[years[i + 1]]

        if (current.opening === null || next.opening === null) continue

        const computedClosing = current.opening + current.totalCharges - current.totalPayments
        const difference = Math.round((computedClosing - next.opening) * 100) / 100

        if (Math.abs(difference) > 1) {
            flags.push({
                row: null,
                inv_no: null,
                type: 'BALANCE CARRY-FORWARD MISMATCH',
                severity: 'CRITICAL',
                detail: `Computed closing balance for ${years[i]} ($${computedClosing.toFixed(2)}) does not match Opening Balance recorded for ${years[i + 1]} ($${next.opening.toFixed(2)}). Difference: $${difference.toFixed(2)}`
            })
        }
    }

    return flags
}

// Main audit function
function auditStatement(invoices) {
    const flags = []
    const RATES = calculateExpectedRates(invoices)
    const invoiceNumbers = []
    const validInvoiceNumbers = []

    // First pass - collect all valid invoice numbers
    invoices.forEach(row => {
        if (row['INV.NO.'] && row['AMOUNT'] && parseFloat(row['PAYMENTS']) === 0) {
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

       // CHECK 4 - Payment referencing non-existent invoice(s)
        if (payment > 0 && invNo) {
           if (particulars.includes('3068')) {
               console.log('DEBUG multi-invoice row:', JSON.stringify({ invNo, particulars, payment }))
           }
           // Extract the letter prefix (e.g. "WH" from "WH 3046") to apply to any
           // additional slash-separated invoice numbers referenced in the same payment
           const prefixMatch = invNo.match(/^([A-Z]+)/i)
            const prefix = prefixMatch ? prefixMatch[1] : ''

            const referencedInvoices = [invNo]

            // Look for additional invoice numbers written like "/3068/3013/3125"
            const additionalRefs = particulars.match(/\/(\d{3,6})/g)
            if (additionalRefs && prefix) {
                additionalRefs.forEach(ref => {
                    const num = ref.replace('/', '')
                    referencedInvoices.push(`${prefix} ${num}`)
                })
            }

            referencedInvoices.forEach(ref => {
                if (!validInvoiceNumbers.includes(ref)) {
                    flags.push({
                        row: rowNum,
                        inv_no: ref,
                        type: 'GHOST PAYMENT',
                        severity: 'CRITICAL',
                        detail: `Payment of $${payment} references invoice ${ref} which does not exist in this statement`
                    })
                }
            })
        }
    })

    const carryForwardFlags = checkBalanceCarryForward(invoices)
    flags.push(...carryForwardFlags)

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