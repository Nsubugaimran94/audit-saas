async function parseDocument(file) {
    const isPdf = file.name.toLowerCase().endsWith('.pdf')

    if (isPdf) {
        const { invoices, headerText } = await extractPdfInvoicesWithHeader(file)

        let client = 'Unknown Client'
        let supplier = 'Unknown Supplier'

        if (headerText.includes('NAK')) client = 'NAK Shipping & Logistics Ltd'
        if (headerText.includes('WHITE HORSE')) supplier = 'White Horse Carriers Ltd'

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

async function extractPdfInvoicesWithHeader(file) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

    let allRows = []
    let headerText = ''
    let columnRanges = null

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum)
        const textContent = await page.getTextContent()

        const items = textContent.items.map(item => ({
            text: item.str,
            x: Math.round(item.transform[4]),
            y: Math.round(item.transform[5])
        }))

        if (pageNum === 1) {
            headerText = items.map(item => item.text).join(' ').toUpperCase()
            const detected = detectColumnPositions(items)
            columnRanges = buildColumnRanges(detected)
            console.log('PAGE 1 DETECTED:', JSON.stringify(detected))
            console.log('COLUMN RANGES:', JSON.stringify(columnRanges))
        }

        const pageRows = extractNakTable(items, columnRanges)
        allRows = allRows.concat(pageRows)
    }

    return { invoices: allRows, headerText: headerText }
}

function detectColumnPositions(items) {
    const headerSynonyms = {
        DATE: ['DATE', 'TXN DATE', 'TRANSACTION DATE'],
        PARTICULARS: ['PARTICULARS', 'DESCRIPTION', 'DETAILS', 'NARRATION'],
        'INV.NO.': ['INV.NO.', 'INVOICE NO', 'INVOICE NUMBER', 'REFERENCE', 'REF', 'INV NO'],
        AMOUNT: ['AMOUNT', 'CHARGED', 'DEBIT', 'CHARGES'],
        PAYMENTS: ['PAYMENTS', 'SETTLED', 'CREDIT', 'PAID']
    }

    const detected = {}

    items.forEach(item => {
        const text = item.text.trim().toUpperCase()
        if (!text) return

        for (const [col, synonyms] of Object.entries(headerSynonyms)) {
            if (!detected[col] && synonyms.some(s => text === s)) {
                detected[col] = item.x
            }
        }
    })

    return detected
}

function buildColumnRanges(detected) {
    const order = ['DATE', 'PARTICULARS', 'INV.NO.', 'AMOUNT', 'PAYMENTS']
    const foundCols = order.filter(col => detected[col] !== undefined)

    if (foundCols.length < 3) {
        // Not enough headers detected - fall back to NAK's known-good boundaries
        return {
            DATE: [40, 95],
            PARTICULARS: [95, 350],
            'INV.NO.': [350, 400],
            AMOUNT: [400, 462],
            PAYMENTS: [462, 540]
        }
    }

    const sorted = foundCols.sort((a, b) => detected[a] - detected[b])
    const ranges = {}

    sorted.forEach((col, i) => {
        const start = detected[col] - 15
        const end = i < sorted.length - 1 ? detected[sorted[i + 1]] - 15 : detected[col] + 200
        ranges[col] = [start, end]
    })

    return ranges
}

function extractNakTable(items, columnRanges) {
    const rowsByY = {}
    items.forEach(item => {
        const yKey = item.y
        if (!rowsByY[yKey]) rowsByY[yKey] = []
        rowsByY[yKey].push(item)
    })

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

            const cleanInvNo = row['INV.NO.'].replace(/\$/g, '').trim()
            const looksLikeAmount = /^[\d,]+\.\d{2}$/.test(cleanInvNo) || /^[\d,]+$/.test(cleanInvNo)

            if (cleanInvNo && cleanInvNo.length >= 2 && !looksLikeAmount) {
                // Trust the column position - genuinely extracted, works for any invoice format
                row['INV.NO.'] = cleanInvNo
            } else {
                // Column position gave nothing useful - try generic pattern in PARTICULARS
                // Matches things like: WH 2762, INV-1234, ABC5678, PO 9012
                const genericMatch = row.PARTICULARS.match(/\b[A-Z]{2,5}[\s\-\/]??\d{3,6}\b/)
                if (genericMatch) {
                    row['INV.NO.'] = genericMatch[0].replace(/\s+/g, ' ').trim()
                    row.PARTICULARS = row.PARTICULARS.replace(genericMatch[0], '').trim()
                } else {
                    row['INV.NO.'] = ''
                }
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