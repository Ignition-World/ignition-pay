"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
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
exports.Proposal = exports.ProposalStatus = void 0;
const typeorm_1 = require("typeorm");
/**
 * Lifecycle states enforced by the governance service.
 *
 * draft    → created, not yet open for voting
 * active   → voting window is open (votingStartsAt <= now <= votingEndsAt)
 * passed   → voting window closed, quorum met and yes votes outnumber no votes
 * executed → a passed proposal has been executed
 * rejected → voting window closed without quorum, or yes votes did not win
 */
var ProposalStatus;
(function (ProposalStatus) {
    ProposalStatus["DRAFT"] = "draft";
    ProposalStatus["ACTIVE"] = "active";
    ProposalStatus["PASSED"] = "passed";
    ProposalStatus["EXECUTED"] = "executed";
    ProposalStatus["REJECTED"] = "rejected";
})(ProposalStatus || (exports.ProposalStatus = ProposalStatus = {}));
let Proposal = (() => {
    let _classDecorators = [(0, typeorm_1.Entity)('proposals')];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _id_decorators;
    let _id_initializers = [];
    let _id_extraInitializers = [];
    let _title_decorators;
    let _title_initializers = [];
    let _title_extraInitializers = [];
    let _description_decorators;
    let _description_initializers = [];
    let _description_extraInitializers = [];
    let _status_decorators;
    let _status_initializers = [];
    let _status_extraInitializers = [];
    let _votingStartsAt_decorators;
    let _votingStartsAt_initializers = [];
    let _votingStartsAt_extraInitializers = [];
    let _votingEndsAt_decorators;
    let _votingEndsAt_initializers = [];
    let _votingEndsAt_extraInitializers = [];
    let _quorumThresholdPercent_decorators;
    let _quorumThresholdPercent_initializers = [];
    let _quorumThresholdPercent_extraInitializers = [];
    let _eligibleVoters_decorators;
    let _eligibleVoters_initializers = [];
    let _eligibleVoters_extraInitializers = [];
    let _yesVotes_decorators;
    let _yesVotes_initializers = [];
    let _yesVotes_extraInitializers = [];
    let _noVotes_decorators;
    let _noVotes_initializers = [];
    let _noVotes_extraInitializers = [];
    let _abstainVotes_decorators;
    let _abstainVotes_initializers = [];
    let _abstainVotes_extraInitializers = [];
    let _tallyExecutedAt_decorators;
    let _tallyExecutedAt_initializers = [];
    let _tallyExecutedAt_extraInitializers = [];
    let _executedAt_decorators;
    let _executedAt_initializers = [];
    let _executedAt_extraInitializers = [];
    let _createdAt_decorators;
    let _createdAt_initializers = [];
    let _createdAt_extraInitializers = [];
    let _updatedAt_decorators;
    let _updatedAt_initializers = [];
    let _updatedAt_extraInitializers = [];
    var Proposal = _classThis = class {
        constructor() {
            this.id = __runInitializers(this, _id_initializers, void 0);
            this.title = (__runInitializers(this, _id_extraInitializers), __runInitializers(this, _title_initializers, void 0));
            this.description = (__runInitializers(this, _title_extraInitializers), __runInitializers(this, _description_initializers, void 0));
            this.status = (__runInitializers(this, _description_extraInitializers), __runInitializers(this, _status_initializers, void 0));
            /** Voting window start (ISO). Votes before this are rejected. */
            this.votingStartsAt = (__runInitializers(this, _status_extraInitializers), __runInitializers(this, _votingStartsAt_initializers, void 0));
            /** Voting window end (ISO). Votes after this are rejected. */
            this.votingEndsAt = (__runInitializers(this, _votingStartsAt_extraInitializers), __runInitializers(this, _votingEndsAt_initializers, void 0));
            /**
             * Minimum participation, as a percentage of the eligible electorate
             * (0-100), required for a proposal outcome to be valid. If the
             * participation threshold is not met the proposal is rejected and can
             * never be executed (quorum enforcement).
             */
            this.quorumThresholdPercent = (__runInitializers(this, _votingEndsAt_extraInitializers), __runInitializers(this, _quorumThresholdPercent_initializers, void 0));
            /**
             * Snapshot of the eligible electorate taken when the proposal was
             * created. Quorum is evaluated against this snapshot so later changes
             * to the user base cannot inflate or deflate participation.
             */
            this.eligibleVoters = (__runInitializers(this, _quorumThresholdPercent_extraInitializers), __runInitializers(this, _eligibleVoters_initializers, void 0));
            this.yesVotes = (__runInitializers(this, _eligibleVoters_extraInitializers), __runInitializers(this, _yesVotes_initializers, void 0));
            this.noVotes = (__runInitializers(this, _yesVotes_extraInitializers), __runInitializers(this, _noVotes_initializers, void 0));
            this.abstainVotes = (__runInitializers(this, _noVotes_extraInitializers), __runInitializers(this, _abstainVotes_initializers, void 0));
            /** Timestamp of the tally that moved the proposal out of `active`. */
            this.tallyExecutedAt = (__runInitializers(this, _abstainVotes_extraInitializers), __runInitializers(this, _tallyExecutedAt_initializers, void 0));
            /** Timestamp of execution for `passed` proposals. */
            this.executedAt = (__runInitializers(this, _tallyExecutedAt_extraInitializers), __runInitializers(this, _executedAt_initializers, void 0));
            this.createdAt = (__runInitializers(this, _executedAt_extraInitializers), __runInitializers(this, _createdAt_initializers, void 0));
            this.updatedAt = (__runInitializers(this, _createdAt_extraInitializers), __runInitializers(this, _updatedAt_initializers, void 0));
            __runInitializers(this, _updatedAt_extraInitializers);
        }
    };
    __setFunctionName(_classThis, "Proposal");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _id_decorators = [(0, typeorm_1.PrimaryGeneratedColumn)('uuid')];
        _title_decorators = [(0, typeorm_1.Column)({ type: 'varchar', length: 255 })];
        _description_decorators = [(0, typeorm_1.Column)({ type: 'text' })];
        _status_decorators = [(0, typeorm_1.Index)(), (0, typeorm_1.Column)({ type: 'varchar', length: 20, default: ProposalStatus.DRAFT })];
        _votingStartsAt_decorators = [(0, typeorm_1.Column)({ type: 'timestamp' })];
        _votingEndsAt_decorators = [(0, typeorm_1.Column)({ type: 'timestamp' })];
        _quorumThresholdPercent_decorators = [(0, typeorm_1.Column)({ type: 'int', default: 20 })];
        _eligibleVoters_decorators = [(0, typeorm_1.Column)({ type: 'int', default: 0 })];
        _yesVotes_decorators = [(0, typeorm_1.Column)({ type: 'int', default: 0 })];
        _noVotes_decorators = [(0, typeorm_1.Column)({ type: 'int', default: 0 })];
        _abstainVotes_decorators = [(0, typeorm_1.Column)({ type: 'int', default: 0 })];
        _tallyExecutedAt_decorators = [(0, typeorm_1.Column)({ type: 'timestamp', nullable: true })];
        _executedAt_decorators = [(0, typeorm_1.Column)({ type: 'timestamp', nullable: true })];
        _createdAt_decorators = [(0, typeorm_1.CreateDateColumn)({ type: 'timestamp' })];
        _updatedAt_decorators = [(0, typeorm_1.UpdateDateColumn)({ type: 'timestamp' })];
        __esDecorate(null, null, _id_decorators, { kind: "field", name: "id", static: false, private: false, access: { has: obj => "id" in obj, get: obj => obj.id, set: (obj, value) => { obj.id = value; } }, metadata: _metadata }, _id_initializers, _id_extraInitializers);
        __esDecorate(null, null, _title_decorators, { kind: "field", name: "title", static: false, private: false, access: { has: obj => "title" in obj, get: obj => obj.title, set: (obj, value) => { obj.title = value; } }, metadata: _metadata }, _title_initializers, _title_extraInitializers);
        __esDecorate(null, null, _description_decorators, { kind: "field", name: "description", static: false, private: false, access: { has: obj => "description" in obj, get: obj => obj.description, set: (obj, value) => { obj.description = value; } }, metadata: _metadata }, _description_initializers, _description_extraInitializers);
        __esDecorate(null, null, _status_decorators, { kind: "field", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status, set: (obj, value) => { obj.status = value; } }, metadata: _metadata }, _status_initializers, _status_extraInitializers);
        __esDecorate(null, null, _votingStartsAt_decorators, { kind: "field", name: "votingStartsAt", static: false, private: false, access: { has: obj => "votingStartsAt" in obj, get: obj => obj.votingStartsAt, set: (obj, value) => { obj.votingStartsAt = value; } }, metadata: _metadata }, _votingStartsAt_initializers, _votingStartsAt_extraInitializers);
        __esDecorate(null, null, _votingEndsAt_decorators, { kind: "field", name: "votingEndsAt", static: false, private: false, access: { has: obj => "votingEndsAt" in obj, get: obj => obj.votingEndsAt, set: (obj, value) => { obj.votingEndsAt = value; } }, metadata: _metadata }, _votingEndsAt_initializers, _votingEndsAt_extraInitializers);
        __esDecorate(null, null, _quorumThresholdPercent_decorators, { kind: "field", name: "quorumThresholdPercent", static: false, private: false, access: { has: obj => "quorumThresholdPercent" in obj, get: obj => obj.quorumThresholdPercent, set: (obj, value) => { obj.quorumThresholdPercent = value; } }, metadata: _metadata }, _quorumThresholdPercent_initializers, _quorumThresholdPercent_extraInitializers);
        __esDecorate(null, null, _eligibleVoters_decorators, { kind: "field", name: "eligibleVoters", static: false, private: false, access: { has: obj => "eligibleVoters" in obj, get: obj => obj.eligibleVoters, set: (obj, value) => { obj.eligibleVoters = value; } }, metadata: _metadata }, _eligibleVoters_initializers, _eligibleVoters_extraInitializers);
        __esDecorate(null, null, _yesVotes_decorators, { kind: "field", name: "yesVotes", static: false, private: false, access: { has: obj => "yesVotes" in obj, get: obj => obj.yesVotes, set: (obj, value) => { obj.yesVotes = value; } }, metadata: _metadata }, _yesVotes_initializers, _yesVotes_extraInitializers);
        __esDecorate(null, null, _noVotes_decorators, { kind: "field", name: "noVotes", static: false, private: false, access: { has: obj => "noVotes" in obj, get: obj => obj.noVotes, set: (obj, value) => { obj.noVotes = value; } }, metadata: _metadata }, _noVotes_initializers, _noVotes_extraInitializers);
        __esDecorate(null, null, _abstainVotes_decorators, { kind: "field", name: "abstainVotes", static: false, private: false, access: { has: obj => "abstainVotes" in obj, get: obj => obj.abstainVotes, set: (obj, value) => { obj.abstainVotes = value; } }, metadata: _metadata }, _abstainVotes_initializers, _abstainVotes_extraInitializers);
        __esDecorate(null, null, _tallyExecutedAt_decorators, { kind: "field", name: "tallyExecutedAt", static: false, private: false, access: { has: obj => "tallyExecutedAt" in obj, get: obj => obj.tallyExecutedAt, set: (obj, value) => { obj.tallyExecutedAt = value; } }, metadata: _metadata }, _tallyExecutedAt_initializers, _tallyExecutedAt_extraInitializers);
        __esDecorate(null, null, _executedAt_decorators, { kind: "field", name: "executedAt", static: false, private: false, access: { has: obj => "executedAt" in obj, get: obj => obj.executedAt, set: (obj, value) => { obj.executedAt = value; } }, metadata: _metadata }, _executedAt_initializers, _executedAt_extraInitializers);
        __esDecorate(null, null, _createdAt_decorators, { kind: "field", name: "createdAt", static: false, private: false, access: { has: obj => "createdAt" in obj, get: obj => obj.createdAt, set: (obj, value) => { obj.createdAt = value; } }, metadata: _metadata }, _createdAt_initializers, _createdAt_extraInitializers);
        __esDecorate(null, null, _updatedAt_decorators, { kind: "field", name: "updatedAt", static: false, private: false, access: { has: obj => "updatedAt" in obj, get: obj => obj.updatedAt, set: (obj, value) => { obj.updatedAt = value; } }, metadata: _metadata }, _updatedAt_initializers, _updatedAt_extraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        Proposal = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return Proposal = _classThis;
})();
exports.Proposal = Proposal;
