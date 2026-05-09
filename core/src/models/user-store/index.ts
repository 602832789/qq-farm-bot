export {};
const auth = require('./auth');
const users = require('./users');
const cardClaim = require('./card-claim');

// Initialize default admin on load
users.initDefaultAdmin();

module.exports = {
    // Auth
    validateUser: users.validateUser,
    registerUser: users.registerUser,
    renewUser: users.renewUser,
    getAllUsers: users.getAllUsers,
    updateUser: users.updateUser,
    editUser: users.editUser,
    getAllCards: users.getAllCards,
    createCard: users.createCard,
    createCardsBatch: users.createCardsBatch,
    updateCard: users.updateCard,
    deleteCard: users.deleteCard,
    deleteCardsBatch: users.deleteCardsBatch,
    deleteUser: users.deleteUser,
    changePassword: users.changePassword,
    DEFAULT_ACCOUNT_LIMIT: users.DEFAULT_ACCOUNT_LIMIT,
    addLoginLog: auth.addLoginLog,
    getLoginLogs: auth.getLoginLogs,
    clearLoginLogs: auth.clearLoginLogs,

    // Card claim
    getCardClaimStatus: cardClaim.getCardClaimStatus,
    setCardClaimStatus: cardClaim.setCardClaimStatus,
    claimCardByUA: cardClaim.claimCardByUA,
    getCardClaimRecords: cardClaim.getCardClaimRecords,
    clearExpiredClaimRecords: cardClaim.clearExpiredClaimRecords,
};
