"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypeBadge = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const TypeBadge = ({ type }) => {
    if (type === 'UNKNOWN')
        return null;
    let backgroundColor = '#e2e8f0'; // default gray
    let color = '#1e293b';
    switch (type) {
        case 'M':
            backgroundColor = '#d8b4fe'; // purple
            color = '#581c87';
            break;
        case 'G':
            backgroundColor = '#bfdbfe'; // blue
            color = '#1e3a8a';
            break;
        case 'C':
            backgroundColor = '#fdba74'; // orange
            color = '#9a3412';
            break;
    }
    return ((0, jsx_runtime_1.jsx)("div", { style: {
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0.25rem 0.5rem',
            borderRadius: '0.375rem',
            backgroundColor,
            color,
            fontWeight: 'bold',
            fontSize: '0.875rem',
            marginRight: '0.5rem',
            minWidth: '2rem',
            userSelect: 'none'
        }, title: `${type}-address`, children: type }));
};
exports.TypeBadge = TypeBadge;
