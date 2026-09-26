"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddressInput = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const TypeBadge_1 = require("./components/TypeBadge");
const WarningList_1 = require("./components/WarningList");
const MemoField_1 = require("./components/MemoField");
const AddressInput = () => {
    const [address, setAddress] = (0, react_1.useState)('');
    const [memo, setMemo] = (0, react_1.useState)('');
    const type = (0, react_1.useMemo)(() => {
        if (!address)
            return 'UNKNOWN';
        const firstChar = address.charAt(0).toUpperCase();
        if (firstChar === 'M')
            return 'M';
        if (firstChar === 'G')
            return 'G';
        if (firstChar === 'C')
            return 'C';
        return 'UNKNOWN';
    }, [address]);
    const showMemo = type === 'G' || type === 'UNKNOWN';
    const warnings = (0, react_1.useMemo)(() => {
        const list = [];
        if (type === 'C') {
            list.push('Contract addresses cannot be used for standard payments.');
        }
        return list;
    }, [type]);
    return ((0, jsx_runtime_1.jsxs)("div", { style: { maxWidth: '32rem', margin: '0 auto', fontFamily: 'sans-serif' }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { position: 'relative', display: 'flex', alignItems: 'center' }, children: [type !== 'UNKNOWN' && ((0, jsx_runtime_1.jsx)("div", { style: { position: 'absolute', left: '0.5rem' }, children: (0, jsx_runtime_1.jsx)(TypeBadge_1.TypeBadge, { type: type }) })), (0, jsx_runtime_1.jsx)("input", { type: "text", placeholder: "Paste Stellar address (G..., M..., C...)", value: address, onChange: (e) => setAddress(e.target.value), style: {
                            width: '100%',
                            padding: `0.75rem 0.75rem 0.75rem ${type !== 'UNKNOWN' ? '3rem' : '0.75rem'}`,
                            border: '1px solid #cbd5e1',
                            borderRadius: '0.5rem',
                            fontSize: '1rem',
                            boxSizing: 'border-box',
                            outline: 'none',
                            transition: 'padding 0.2s ease'
                        } })] }), (0, jsx_runtime_1.jsx)(MemoField_1.MemoField, { isVisible: showMemo && !!address, value: memo, onChange: setMemo }), (0, jsx_runtime_1.jsx)(WarningList_1.WarningList, { warnings: warnings })] }));
};
exports.AddressInput = AddressInput;
