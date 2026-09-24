"use strict";
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GovernanceController = void 0;
const common_1 = require("@nestjs/common");
let GovernanceController = (() => {
    let _classDecorators = [(0, common_1.Controller)('governance')];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _createProposal_decorators;
    let _listProposals_decorators;
    let _getProposal_decorators;
    let _activateProposal_decorators;
    let _castVote_decorators;
    let _tallyAndClose_decorators;
    let _executeProposal_decorators;
    let _getResults_decorators;
    var GovernanceController = _classThis = class {
        constructor(governanceService) {
            this.governanceService = (__runInitializers(this, _instanceExtraInitializers), governanceService);
        }
        async createProposal(dto) {
            return this.governanceService.createProposal(dto);
        }
        async listProposals(status) {
            return this.governanceService.listProposals(status);
        }
        async getProposal(id) {
            return this.governanceService.getProposal(id);
        }
        async activateProposal(id) {
            return this.governanceService.activateProposal(id);
        }
        async castVote(id, dto) {
            return this.governanceService.castVote(id, dto);
        }
        async tallyAndClose(id) {
            return this.governanceService.tallyAndClose(id);
        }
        async executeProposal(id) {
            return this.governanceService.executeProposal(id);
        }
        async getResults(id) {
            return this.governanceService.getResults(id);
        }
    };
    __setFunctionName(_classThis, "GovernanceController");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _createProposal_decorators = [(0, common_1.Post)('proposals')];
        _listProposals_decorators = [(0, common_1.Get)('proposals')];
        _getProposal_decorators = [(0, common_1.Get)('proposals/:id')];
        _activateProposal_decorators = [(0, common_1.Post)('proposals/:id/activate')];
        _castVote_decorators = [(0, common_1.Post)('proposals/:id/votes')];
        _tallyAndClose_decorators = [(0, common_1.Post)('proposals/:id/tally')];
        _executeProposal_decorators = [(0, common_1.Post)('proposals/:id/execute')];
        _getResults_decorators = [(0, common_1.Get)('proposals/:id/results')];
        __esDecorate(_classThis, null, _createProposal_decorators, { kind: "method", name: "createProposal", static: false, private: false, access: { has: obj => "createProposal" in obj, get: obj => obj.createProposal }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _listProposals_decorators, { kind: "method", name: "listProposals", static: false, private: false, access: { has: obj => "listProposals" in obj, get: obj => obj.listProposals }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getProposal_decorators, { kind: "method", name: "getProposal", static: false, private: false, access: { has: obj => "getProposal" in obj, get: obj => obj.getProposal }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _activateProposal_decorators, { kind: "method", name: "activateProposal", static: false, private: false, access: { has: obj => "activateProposal" in obj, get: obj => obj.activateProposal }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _castVote_decorators, { kind: "method", name: "castVote", static: false, private: false, access: { has: obj => "castVote" in obj, get: obj => obj.castVote }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _tallyAndClose_decorators, { kind: "method", name: "tallyAndClose", static: false, private: false, access: { has: obj => "tallyAndClose" in obj, get: obj => obj.tallyAndClose }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _executeProposal_decorators, { kind: "method", name: "executeProposal", static: false, private: false, access: { has: obj => "executeProposal" in obj, get: obj => obj.executeProposal }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getResults_decorators, { kind: "method", name: "getResults", static: false, private: false, access: { has: obj => "getResults" in obj, get: obj => obj.getResults }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        GovernanceController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return GovernanceController = _classThis;
})();
exports.GovernanceController = GovernanceController;
