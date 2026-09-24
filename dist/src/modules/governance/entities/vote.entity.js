"use strict";
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
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Vote = exports.VoteChoice = void 0;
const typeorm_1 = require("typeorm");
var VoteChoice;
(function (VoteChoice) {
    VoteChoice["YES"] = "yes";
    VoteChoice["NO"] = "no";
    VoteChoice["ABSTAIN"] = "abstain";
})(VoteChoice || (exports.VoteChoice = VoteChoice = {}));
let Vote = (() => {
    let _classDecorators = [(0, typeorm_1.Entity)('votes'), (0, typeorm_1.Unique)(['proposalId', 'voterId'])];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _id_decorators;
    let _id_initializers = [];
    let _id_extraInitializers = [];
    let _proposalId_decorators;
    let _proposalId_initializers = [];
    let _proposalId_extraInitializers = [];
    let _voterId_decorators;
    let _voterId_initializers = [];
    let _voterId_extraInitializers = [];
    let _choice_decorators;
    let _choice_initializers = [];
    let _choice_extraInitializers = [];
    let _weight_decorators;
    let _weight_initializers = [];
    let _weight_extraInitializers = [];
    let _createdAt_decorators;
    let _createdAt_initializers = [];
    let _createdAt_extraInitializers = [];
    var Vote = _classThis = class {
        constructor() {
            this.id = __runInitializers(this, _id_initializers, void 0);
            this.proposalId = (__runInitializers(this, _id_extraInitializers), __runInitializers(this, _proposalId_initializers, void 0));
            this.voterId = (__runInitializers(this, _proposalId_extraInitializers), __runInitializers(this, _voterId_initializers, void 0));
            this.choice = (__runInitializers(this, _voterId_extraInitializers), __runInitializers(this, _choice_initializers, void 0));
            /** Vote weight (default 1); a voter may only cast one vote per proposal. */
            this.weight = (__runInitializers(this, _choice_extraInitializers), __runInitializers(this, _weight_initializers, void 0));
            this.createdAt = (__runInitializers(this, _weight_extraInitializers), __runInitializers(this, _createdAt_initializers, void 0));
            __runInitializers(this, _createdAt_extraInitializers);
        }
    };
    __setFunctionName(_classThis, "Vote");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _id_decorators = [(0, typeorm_1.PrimaryGeneratedColumn)('uuid')];
        _proposalId_decorators = [(0, typeorm_1.Index)(), (0, typeorm_1.Column)({ type: 'uuid' })];
        _voterId_decorators = [(0, typeorm_1.Index)(), (0, typeorm_1.Column)({ type: 'uuid' })];
        _choice_decorators = [(0, typeorm_1.Column)({ type: 'varchar', length: 10 })];
        _weight_decorators = [(0, typeorm_1.Column)({ type: 'int', default: 1 })];
        _createdAt_decorators = [(0, typeorm_1.CreateDateColumn)({ type: 'timestamp' })];
        __esDecorate(null, null, _id_decorators, { kind: "field", name: "id", static: false, private: false, access: { has: obj => "id" in obj, get: obj => obj.id, set: (obj, value) => { obj.id = value; } }, metadata: _metadata }, _id_initializers, _id_extraInitializers);
        __esDecorate(null, null, _proposalId_decorators, { kind: "field", name: "proposalId", static: false, private: false, access: { has: obj => "proposalId" in obj, get: obj => obj.proposalId, set: (obj, value) => { obj.proposalId = value; } }, metadata: _metadata }, _proposalId_initializers, _proposalId_extraInitializers);
        __esDecorate(null, null, _voterId_decorators, { kind: "field", name: "voterId", static: false, private: false, access: { has: obj => "voterId" in obj, get: obj => obj.voterId, set: (obj, value) => { obj.voterId = value; } }, metadata: _metadata }, _voterId_initializers, _voterId_extraInitializers);
        __esDecorate(null, null, _choice_decorators, { kind: "field", name: "choice", static: false, private: false, access: { has: obj => "choice" in obj, get: obj => obj.choice, set: (obj, value) => { obj.choice = value; } }, metadata: _metadata }, _choice_initializers, _choice_extraInitializers);
        __esDecorate(null, null, _weight_decorators, { kind: "field", name: "weight", static: false, private: false, access: { has: obj => "weight" in obj, get: obj => obj.weight, set: (obj, value) => { obj.weight = value; } }, metadata: _metadata }, _weight_initializers, _weight_extraInitializers);
        __esDecorate(null, null, _createdAt_decorators, { kind: "field", name: "createdAt", static: false, private: false, access: { has: obj => "createdAt" in obj, get: obj => obj.createdAt, set: (obj, value) => { obj.createdAt = value; } }, metadata: _metadata }, _createdAt_initializers, _createdAt_extraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        Vote = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return Vote = _classThis;
})();
exports.Vote = Vote;
