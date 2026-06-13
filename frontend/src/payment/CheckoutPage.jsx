import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useUser } from '../context/UserContext';
import { useRequireBillingProfile } from '../hooks/useBillingAccess.js';
import PricingCard from './PricingCard';
import CheckoutForm from './CheckoutForm';
import UserBalance from './UserBalance';
import { motion, AnimatePresence } from 'framer-motion';
import './checkout.css';
import Layout from '../Components/Layout';

const CheckoutPage = () => {
    const navigate = useNavigate();
    const { user, refreshUser } = useUser();
    const { firebaseReady, allowed } = useRequireBillingProfile('/checkout');
    const [plans, setPlans] = useState([]);
    const [selectedPlan, setSelectedPlan] = useState(null);
    const [paymentMethod, setPaymentMethod] = useState('easypaisa');
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [message, setMessage] = useState(null);
    const [payerPhone, setPayerPhone] = useState('');
    const [screenshotFile, setScreenshotFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            try {
                const plansData = await api.getPlans();
                setPlans(plansData);

                // Check for plan selected from Home Page

                const savedPlan = localStorage.getItem('selectedPlan');
                if (savedPlan) {
                    const parsedPlan = JSON.parse(savedPlan);
                    setSelectedPlan(parsedPlan);

                    // Clear it so it doesn't persist forever

                    localStorage.removeItem('selectedPlan');
                } else if (plansData.length > 1) {

                    // Default selection if none from Home

                    setSelectedPlan(plansData[1]);
                }
            } catch (error) {
                console.error('Fetch error:', error);
                setMessage({ type: 'error', text: 'Failed to load checkout data.' });
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    useEffect(() => {
        if (!screenshotFile) {
            setPreviewUrl('');
            return undefined;
        }
        const nextUrl = URL.createObjectURL(screenshotFile);
        setPreviewUrl(nextUrl);
        return () => URL.revokeObjectURL(nextUrl);
    }, [screenshotFile]);

    const copyText = async (value) => {
        try {
            await navigator.clipboard.writeText(String(value || ''));
            setMessage({ type: 'success', text: 'Copied to clipboard.' });
        } catch {
            setMessage({ type: 'error', text: 'Could not copy text on this browser.' });
        }
    };

    const makeOrderId = () => {
        const stamp = Date.now().toString(36).toUpperCase();
        const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
        return `ORD-${stamp}-${rand}`;
    };

    const handlePayment = async () => {
        if (!selectedPlan || processing) return;
        if (!screenshotFile) {
            setMessage({ type: 'error', text: 'Please upload payment screenshot first.' });
            return;
        }
        if (!String(payerPhone || '').trim()) {
            setMessage({ type: 'error', text: 'Please add your wallet number / phone.' });
            return;
        }

        setProcessing(true);
        setMessage(null);

        try {
            const orderId = makeOrderId();
            const uploadResult = await api.uploadPaymentScreenshot({
                image: screenshotFile,
                orderId,
            });
            const result = await api.createPaymentRequest({
                orderId,
                coinsRequested: Number(selectedPlan.coins || 0),
                paymentMethod,
                screenshotUrl: uploadResult.screenshotUrl,
                payerPhone: String(payerPhone || '').trim(),
            });

            setMessage({ type: 'success', text: result.message });
            await refreshUser();
            setScreenshotFile(null);
            setPayerPhone('');
        } catch (error) {
            setMessage({ type: 'error', text: error.message });
        } finally {
            setProcessing(false);
        }
    };

    if (!firebaseReady || !allowed) {
        return (
            <div className="checkout_loading">
                <div className="checkout_spinner"></div>
                <p>Loading Secure Checkout...</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="checkout_loading">
                <div className="checkout_spinner"></div>
                <p>Loading Secure Checkout...</p>
            </div>
        );
    }

    return (
        <Layout>
            <div className="checkout_pageWrapper">
                <div className="checkout_mainContainer">

                    {/* Header Section */}
                    <div className="checkout_header">
                        <button onClick={() => navigate(-1)} className="checkout_backBtn">← Back</button>
                        <h1 className="checkout_title">Recharge Coins</h1>
                        <UserBalance coins={user?.coins} />
                    </div>

                    <AnimatePresence>
                        {message && (
                            <motion.div
                                initial={{ opacity: 0, y: -20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className={`checkout_toast checkout_toast--${message.type}`}
                            >
                                {message.text}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="checkout_grid">
                        {/* Left Column: Plans & Form */}
                        <div className="checkout_leftCol">
                            <section className="checkout_section">
                                <h2 className="checkout_sectionHeader">Choose Your Package</h2>
                                <div className="checkout_plansGrid">
                                    {plans.map(plan => (
                                        <PricingCard
                                            key={plan.id}
                                            plan={plan}
                                            isSelected={selectedPlan?.id === plan.id}
                                            onSelect={setSelectedPlan}
                                        />
                                    ))}
                                </div>
                            </section>

                            <section className="checkout_section">
                                <CheckoutForm
                                    userInfo={user || {}}
                                    paymentMethod={paymentMethod}
                                    setPaymentMethod={setPaymentMethod}
                                    payerPhone={payerPhone}
                                    setPayerPhone={setPayerPhone}
                                    screenshotFile={screenshotFile}
                                    setScreenshotFile={setScreenshotFile}
                                    previewUrl={previewUrl}
                                    onPreviewClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}
                                    copyText={copyText}
                                    busy={processing}
                                />
                            </section>
                        </div>

                        {/* Right Column: Summary */}

                        <div className="checkout_rightCol">
                            <div className="quantumPay_summaryBox">
                                <h2 className="quantumPay_summaryTitle">Order Summary</h2>

                                <div className="quantumPay_row">
                                    <span className="quantumPay_label">Selected Plan</span>
                                    <span className="quantumPay_value">{selectedPlan?.coins || 0} Coins</span>
                                </div>

                                <div className="quantumPay_row">
                                    <span className="quantumPay_label">Subtotal</span>
                                    <span className="quantumPay_value">Rs {Number(selectedPlan?.price || 0).toLocaleString()}</span>
                                </div>

                                <div className="quantumPay_row">
                                    <span className="quantumPay_label">Tax (0%)</span>
                                    <span className="quantumPay_value">Rs 0</span>
                                </div>

                                <div className="quantumPay_divider" />

                                <div className="quantumPay_row quantumPay_total">
                                    <span className="quantumPay_label">Grand Total</span>
                                    <span className="quantumPay_value">Rs {Number(selectedPlan?.price || 0).toLocaleString()}</span>
                                </div>

                                <button
                                    className="quantumPay_btnPrimary"
                                    onClick={handlePayment}
                                    disabled={processing || !selectedPlan || !screenshotFile}
                                >
                                    {processing ? 'Submitting...' : 'Pay Now'}
                                </button>

                                <div className="quantumPay_trustInfo">
                                    <div className="quantumPay_trustItem">🔒 SSL SECURE</div>
                                    <div className="quantumPay_trustItem">🛡️ VERIFIED MERCHANT</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
};

export default CheckoutPage;
