"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoadingSpinner = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const LoadingSpinner = ({ size = 'md', label = 'Loading...', }) => {
    const sizeMap = {
        sm: 'w-4 h-4 border-2',
        md: 'w-6 h-6 border-2',
        lg: 'w-10 h-10 border-3',
    };
    return ((0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2", role: "status", children: [(0, jsx_runtime_1.jsx)("div", { className: `rounded-full border-t-indigo-600 border-gray-200 animate-spin ${sizeMap[size]}` }), label && (0, jsx_runtime_1.jsx)("span", { className: "sr-only", children: label })] }));
};
exports.LoadingSpinner = LoadingSpinner;
exports.default = exports.LoadingSpinner;
