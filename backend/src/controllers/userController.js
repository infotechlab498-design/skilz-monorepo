import * as dataService from '../services/dataService.js';

export const getUser = async (req, res) => {
    try {
        const { id } = req.params;
        if (!req.userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        if (req.userId !== id) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        const user = await dataService.getUserByIdOrUid(id);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        const { password: _p, ...safeUser } = user;
        res.json(safeUser);
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

export const deductCoins = async (req, res) => {
    const { userId: bodyUserId, amount } = req.body;
    const targetUserId = bodyUserId ?? req.userId;
    if (!targetUserId) {
        return res.status(400).json({ success: false, message: 'userId required' });
    }
    if (targetUserId !== req.userId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    try {
        const updatedCoins = await dataService.deductUserCoins(targetUserId, amount);
        res.json({ success: true, updatedCoins });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};
