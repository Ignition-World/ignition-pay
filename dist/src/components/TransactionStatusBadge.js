"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionStatusBadge = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const TransactionStatusBadge = ({ status }) => {
    const badgeStyles = {
        SUCCESS: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 border-emerald-300',
        PENDING: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border-amber-300',
        FAILED: 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200 border-rose-300',
    };
    return ((0, jsx_runtime_1.jsx)("span", { className: `inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badgeStyles[status]}`, children: status }));
};
exports.TransactionStatusBadge = TransactionStatusBadge;
exports.default = exports.TransactionStatusBadge;
