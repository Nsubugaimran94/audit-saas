async function parseDocument(file) {
    const isPdf = file.name.toLowerCase().endsWith('.pdf')

    if (isPdf) {
        const invoices = await extractPdfInvoices(file)

        let client = 'NAK Shipping `& Logistics Ltd'
        let supplier = 'White Horse Carriers Ltd'

        return {
            invoices: invoices,
            client: client,
            supplier: supplier,
            statement_period: new Date().getFullYear().toString()
        }
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader()

        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result)
                const workbook = XLSX.read(data, { type: 'array' })
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
                const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' })

                let client = 'Unknown Client'
                let supplier = 'Unknown Supplier'

                const rawRows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' })

                rawRows.slice(0, 10).forEach(row => {
                    const rowText = row.join(' ').toUpperCase()
                    if (rowText.includes('NAK')) client = 'NAK Shipping & Logistics Ltd'
                    if (rowText.includes('WHITE HORSE')) supplier = 'White Horse Carriers Ltd'
                })

                resolve({
                    invoices: rows,
                    client: client,
                    supplier: supplier,
                    statement_period: new Date().getFullYear().toString(),
                    raw_rows: rawRows
                })
            } catch(err) {
                reject(err)
            }
        }

        reader.onerror = reject
        reader.readAsArrayBuffer(file)
    })
}

async function extractPdfInvoices(file) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

    let allRows = []

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum)
        const textContent = await page.getTextContent()

        const items = textContent.items.map(item => ({
            text: item.str,
            x: Math.round(item.transform[4]),
            y: Math.round(item.transform[5])
        }))

        const pageRows = extractNakTable(items)
        allRows = allRows.concat(pageRows)
    }

    return allRows
}

function extractNakTable(items) {
    const rowsByY = {}
    items.forEach(item => {
        const yKey = item.y
        if (!rowsByY[yKey]) rowsByY[yKey] = []
        rowsByY[yKey].push(item)
    })

    const columnRanges = {
        DATE: [40, 95],
        PARTICULARS: [95, 360],
        'INV.NO.': [360, 410],
        AMOUNT: [410, 472],
        PAYMENTS: [472, 550]
    }

    function assignColumn(x) {
        for (const [col, [min, max]] of Object.entries(columnRanges)) {
            if (x >= min && x < max) return col
        }
        return null
    }

    const structuredRows = []

    Object.keys(rowsByY)
        .sort((a, b) => b - a)
        .forEach(yKey => {
            const rowItems = rowsByY[yKey].sort((a, b) => a.x - b.x)
            const row = { DATE: '', PARTICULARS: '', 'INV.NO.': '', AMOUNT: '', PAYMENTS: '' }

            rowItems.forEach(item => {
                const col = assignColumn(item.x)
                if (col && item.text.trim()) {
                    row[col] = (row[col] + ' ' + item.text).trim()
                }
            })

            const invoiceMatch = (row.PARTICULARS + ' ' + row['INV.NO.']).match(/WH\s?\d{3,5}/i)
            if (invoiceMatch) {
                row['INV.NO.'] = invoiceMatch[0].replace(/\s+/g, ' ').trim()
                row.PARTICULARS = row.PARTICULARS.replace(invoiceMatch[0], '').trim()
            } else if (row['INV.NO.'] === '$' || row['INV.NO.'].trim() === '$') {
                row['INV.NO.'] = ''
            }

            if (/^\d{2}\/\d{2}\/\d{4}$/.test(row.DATE.trim())) {
                structuredRows.push(row)
            }
        })

    structuredRows.forEach(row => {
        row.AMOUNT = row.AMOUNT.replace('$', '').replace(/,/g, '').replace('-', '0').trim()
        row.PAYMENTS = row.PAYMENTS.replace('$', '').replace(/,/g, '').replace('-', '0').trim()

        if (row.AMOUNT === '') row.AMOUNT = '0'
        if (row.PAYMENTS === '') row.PAYMENTS = '0'
    })

    return structuredRows
}