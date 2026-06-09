import React, { useMemo } from 'react';

/**
 * CheckoutForm - payment method, transfer details, and screenshot upload.
 */
const METHOD_DETAILS = {
    jazzcash: {
        title: 'JazzCash Transfer',
        accountName: 'Arjumand Aleem Gulzar',
        account: '+92303-4440870',
        instruction: 'Transfer exact amount, then upload payment screenshot.',
    },
    easypaisa: {
        title: 'Easypaisa Transfer',
        accountName: 'Arjumand Aleem Gulzar',
        account: '+92303-4440870',
        instruction: 'Transfer exact amount, then upload payment screenshot.',
    },
    bank: {
        title: 'Bank Transfer',
        accountName: 'SHAHEQ ALJAZEERA CONTRACTING AND TRADING (SMC-PRIVATE) LIMITED',
        account: 'PK66ABPA0020132483820023',
        bank: 'Allied Bank',
        instruction: 'Use your account as sender and attach receipt screenshot after transfer.',
    },
};

const methods = [
    { id: 'jazzcash', name: 'JazzCash', short: 'JC', color: '#f59e0b' },
    { id: 'easypaisa', name: 'Easypaisa', short: 'EP', color: '#16a34a' },
    { id: 'bank', name: 'Bank Transfer', short: 'BK', color: '#2563eb' },
];

const CheckoutForm = ({
    userInfo,
    paymentMethod,
    setPaymentMethod,
    payerPhone,
    setPayerPhone,
    screenshotFile,
    setScreenshotFile,
    previewUrl,
    onPreviewClick,
    copyText,
    busy,
}) => {
    const details = useMemo(() => METHOD_DETAILS[paymentMethod] || METHOD_DETAILS.easypaisa, [paymentMethod]);

    const onPickFile = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const safeType = ['image/jpeg', 'image/png', 'image/webp'].includes(String(file.type || '').toLowerCase());
        if (!safeType) {
            window.alert('Only JPG, PNG or WEBP image is allowed.');
            event.target.value = '';
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            window.alert('Image must be 2MB or smaller.');
            event.target.value = '';
            return;
        }
        setScreenshotFile(file);
    };

    return (
        <div className="neonEdge_formBox">
            <div className="neonEdge_section">
                <h4 className="neonEdge_sectionTitle">Payment Method</h4>
                <div className="neonEdge_methodGrid">
                    {methods.map((m) => (
                        <div 
                            key={m.id}
                            className={`neonEdge_methodCard ${paymentMethod === m.id ? 'neonEdge_methodCard--active' : ''}`}
                            onClick={() => setPaymentMethod(m.id)}
                        >
                            <div className="neonEdge_methodIcon" style={{ backgroundColor: m.color }}>
                                {m.short}
                            </div>
                            <span className="neonEdge_methodName">{m.name}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="neonEdge_section">
                <h4 className="neonEdge_sectionTitle">{details.title}</h4>
                <div className="neonEdge_inputGroup">
                    <label className="neonEdge_label">RECEIVER NAME</label>
                    <div className="neonEdge_readonlyLine">
                        <span>{details.accountName}</span>
                        <button type="button" className="neonEdge_copyBtn" onClick={() => copyText(details.accountName)}>
                            Copy
                        </button>
                    </div>
                </div>

                <div className="neonEdge_inputGroup">
                    <label className="neonEdge_label">{paymentMethod === 'bank' ? 'ACCOUNT NUMBER / IBAN' : 'WALLET NUMBER'}</label>
                    <div className="neonEdge_readonlyLine">
                        <span>{details.account}</span>
                        <button type="button" className="neonEdge_copyBtn" onClick={() => copyText(details.account)}>
                            Copy
                        </button>
                    </div>
                </div>

                {details.bank ? (
                    <div className="neonEdge_inputGroup">
                        <label className="neonEdge_label">BANK NAME</label>
                        <div className="neonEdge_readonlyLine">
                            <span>{details.bank}</span>
                            <button type="button" className="neonEdge_copyBtn" onClick={() => copyText(details.bank)}>
                                Copy
                            </button>
                        </div>
                    </div>
                ) : null}

                <p className="neonEdge_instruction">{details.instruction}</p>

                <h4 className="neonEdge_sectionTitle">User Information</h4>
                <div className="neonEdge_inputGroup">
                    <label className="neonEdge_label">ACCOUNT NAME</label>
                    <input 
                        className="neonEdge_input" 
                        type="text" 
                        value={userInfo.name || ''} 
                        readOnly 
                    />
                </div>
                
                <div className="neonEdge_inputGroup">
                    <label className="neonEdge_label">WALLET NUMBER / PHONE</label>
                    <input 
                        className="neonEdge_input" 
                        type="text" 
                        placeholder="03XXXXXXXXX"
                        value={payerPhone}
                        onChange={(e) => setPayerPhone(e.target.value)}
                    />
                </div>

                <div className="neonEdge_inputGroup">
                    <label className="neonEdge_label">PAYMENT SCREENSHOT (JPG / PNG / WEBP, max 2MB)</label>
                    <input
                        className="neonEdge_input"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={onPickFile}
                        disabled={busy}
                    />
                    {screenshotFile ? (
                        <div className="neonEdge_uploadMeta">
                            <span>{screenshotFile.name}</span>
                            {previewUrl ? (
                                <button type="button" className="neonEdge_copyBtn" onClick={onPreviewClick}>
                                    View
                                </button>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
};

export default CheckoutForm;
