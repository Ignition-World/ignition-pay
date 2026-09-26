"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WarningList = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const WarningList = ({ warnings }) => {
    if (!warnings || warnings.length === 0)
        return null;
    return ((0, jsx_runtime_1.jsxs)("div", { style: {
            marginTop: '0.5rem',
            padding: '0.75rem',
            backgroundColor: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: '0.375rem',
            color: '#92400e',
            fontSize: '0.875rem'
        }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontWeight: 'bold', marginBottom: '0.25rem' }, children: "\u26A0\uFE0F Warnings:" }), (0, jsx_runtime_1.jsx)("ul", { style: { margin: 0, paddingLeft: '1.25rem' }, children: warnings.map((warning, idx) => ((0, jsx_runtime_1.jsx)("li", { style: { marginBottom: '0.25rem' }, children: warning }, idx))) })] }));
};
exports.WarningList = WarningList;
