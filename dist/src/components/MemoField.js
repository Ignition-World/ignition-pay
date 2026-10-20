"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoField = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const MemoField = ({ isVisible, value, onChange }) => {
    if (!isVisible)
        return null;
    return ((0, jsx_runtime_1.jsxs)("div", { style: { marginTop: '0.75rem', display: 'flex', flexDirection: 'column' }, children: [(0, jsx_runtime_1.jsx)("label", { htmlFor: "memo-input", style: { fontSize: '0.875rem', fontWeight: '500', color: '#475569', marginBottom: '0.25rem' }, children: "Memo (Optional)" }), (0, jsx_runtime_1.jsx)("input", { id: "memo-input", type: "text", placeholder: "Enter memo here", value: value, onChange: (e) => onChange(e.target.value), style: {
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #cbd5e1',
                    borderRadius: '0.375rem',
                    fontSize: '1rem',
                    boxSizing: 'border-box',
                    outline: 'none',
                } }), (0, jsx_runtime_1.jsx)("div", { style: { fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }, children: "A memo is sometimes required by exchanges." })] }));
};
exports.MemoField = MemoField;
