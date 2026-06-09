import React from 'react';
import Layout from './Layout';

const Settings = () => {
    return (
        <Layout>
            <div style={{ padding: '100px 20px', textAlign: 'center', color: '#fff' }}>
                <h1>Settings</h1>
                <div style={{ background: '#202738', padding: '40px', borderRadius: '16px', maxWidth: '600px', margin: '20px auto', textAlign: 'left' }}>
                    <div style={{ marginBottom: '20px' }}>
                        <h3>Account Settings</h3>
                        <p style={{ opacity: 0.6 }}>Manage your account details and security.</p>
                    </div>
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                            <span>Notification Emails</span>
                            <div style={{ width: '40px', height: '20px', background: '#31cc92', borderRadius: '10px', position: 'relative' }}>
                                <div style={{ width: '16px', height: '16px', background: '#fff', borderRadius: '50%', position: 'absolute', right: '2px', top: '2px' }}></div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                            <span>Public Profile</span>
                            <div style={{ width: '40px', height: '20px', background: '#31cc92', borderRadius: '10px', position: 'relative' }}>
                                <div style={{ width: '16px', height: '16px', background: '#fff', borderRadius: '50%', position: 'absolute', right: '2px', top: '2px' }}></div>
                            </div>
                        </div>
                    </div>
                    <button style={{ background: '#4f7cff', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', marginTop: '20px' }}>
                        Save Changes
                    </button>
                </div>
            </div>
        </Layout>
    );
};

export default Settings;
