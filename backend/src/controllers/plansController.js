import * as dataService from '../services/dataService.js';

export const getPlans = async (req, res) => {
    try {
        const plans = await dataService.getPlans();
        res.json(plans);
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch plans', error: error.message });
    }
};
