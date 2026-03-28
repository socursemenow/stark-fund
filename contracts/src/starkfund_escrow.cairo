use starknet::ContractAddress;

#[starknet::interface]
trait IStarkFundEscrow<TContractState> {
    fn create_campaign(ref self: TContractState, campaign_id: felt252, founder: ContractAddress, goal: u256, deadline: u64, token: ContractAddress);
    fn contribute(ref self: TContractState, campaign_id: felt252, amount: u256);
    fn withdraw(ref self: TContractState, campaign_id: felt252);
    fn refund(ref self: TContractState, campaign_id: felt252);
    fn claim_refund(ref self: TContractState, campaign_id: felt252);
    fn vote_refund(ref self: TContractState, campaign_id: felt252);
    fn get_raised(self: @TContractState, campaign_id: felt252) -> u256;
    fn get_goal(self: @TContractState, campaign_id: felt252) -> u256;
    fn get_backer_count(self: @TContractState, campaign_id: felt252) -> u32;
    fn get_refund_votes(self: @TContractState, campaign_id: felt252) -> u32;
    fn get_contribution(self: @TContractState, campaign_id: felt252, backer: ContractAddress) -> u256;
    fn is_withdrawn(self: @TContractState, campaign_id: felt252) -> bool;
    fn is_refunded(self: @TContractState, campaign_id: felt252) -> bool;
    fn get_platform_wallet(self: @TContractState) -> ContractAddress;
    fn get_platform_fee_bps(self: @TContractState) -> u16;
}

#[starknet::contract]
mod StarkFundEscrow {
    use super::{ContractAddress, IStarkFundEscrow};
    use starknet::{get_caller_address, get_block_timestamp, get_contract_address};
    use starknet::storage::{
        StoragePointerReadAccess, StoragePointerWriteAccess,
        StorageMapReadAccess, StorageMapWriteAccess, Map,
    };
    use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};

    #[storage]
    struct Storage {
        platform_wallet: ContractAddress,
        platform_fee_bps: u16,
        // Campaign fields stored individually: campaign_id → value
        campaign_founder: Map<felt252, ContractAddress>,
        campaign_token: Map<felt252, ContractAddress>,
        campaign_goal: Map<felt252, u256>,
        campaign_raised: Map<felt252, u256>,
        campaign_deadline: Map<felt252, u64>,
        campaign_backer_count: Map<felt252, u32>,
        campaign_withdrawn: Map<felt252, bool>,
        campaign_refunded: Map<felt252, bool>,
        campaign_refund_votes: Map<felt252, u32>,
        campaign_exists: Map<felt252, bool>,
        // Contributions: (campaign_id, backer) → amount
        contributions: Map<(felt252, ContractAddress), u256>,
        // Vote tracking: (campaign_id, backer) → has_voted
        voted: Map<(felt252, ContractAddress), bool>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        CampaignCreated: CampaignCreated,
        Contributed: Contributed,
        Withdrawn: Withdrawn,
        Refunded: Refunded,
        RefundClaimed: RefundClaimed,
        VotedRefund: VotedRefund,
    }

    #[derive(Drop, starknet::Event)]
    struct CampaignCreated {
        campaign_id: felt252,
        founder: ContractAddress,
        goal: u256,
        deadline: u64,
    }

    #[derive(Drop, starknet::Event)]
    struct Contributed {
        campaign_id: felt252,
        backer: ContractAddress,
        amount: u256,
    }

    #[derive(Drop, starknet::Event)]
    struct Withdrawn {
        campaign_id: felt252,
        founder: ContractAddress,
        amount: u256,
        fee: u256,
    }

    #[derive(Drop, starknet::Event)]
    struct Refunded {
        campaign_id: felt252,
    }

    #[derive(Drop, starknet::Event)]
    struct RefundClaimed {
        campaign_id: felt252,
        backer: ContractAddress,
        amount: u256,
    }

    #[derive(Drop, starknet::Event)]
    struct VotedRefund {
        campaign_id: felt252,
        voter: ContractAddress,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        platform_wallet: ContractAddress,
        platform_fee_bps: u16,
    ) {
        self.platform_wallet.write(platform_wallet);
        self.platform_fee_bps.write(platform_fee_bps);
    }

    #[abi(embed_v0)]
    impl StarkFundEscrowImpl of IStarkFundEscrow<ContractState> {

        fn create_campaign(
            ref self: ContractState,
            campaign_id: felt252,
            founder: ContractAddress,
            goal: u256,
            deadline: u64,
            token: ContractAddress,
        ) {
            assert(!self.campaign_exists.read(campaign_id), 'Campaign already exists');
            assert(goal > 0, 'Goal must be > 0');
            assert(deadline > get_block_timestamp(), 'Deadline must be in future');

            self.campaign_founder.write(campaign_id, founder);
            self.campaign_token.write(campaign_id, token);
            self.campaign_goal.write(campaign_id, goal);
            self.campaign_raised.write(campaign_id, 0);
            self.campaign_deadline.write(campaign_id, deadline);
            self.campaign_backer_count.write(campaign_id, 0);
            self.campaign_withdrawn.write(campaign_id, false);
            self.campaign_refunded.write(campaign_id, false);
            self.campaign_refund_votes.write(campaign_id, 0);
            self.campaign_exists.write(campaign_id, true);

            self.emit(CampaignCreated { campaign_id, founder, goal, deadline });
        }

        fn contribute(ref self: ContractState, campaign_id: felt252, amount: u256) {
            assert(self.campaign_exists.read(campaign_id), 'Campaign does not exist');
            assert(!self.campaign_withdrawn.read(campaign_id), 'Already withdrawn');
            assert(!self.campaign_refunded.read(campaign_id), 'Already refunded');
            assert(get_block_timestamp() < self.campaign_deadline.read(campaign_id), 'Deadline passed');
            assert(amount > 0, 'Amount must be > 0');

            let caller = get_caller_address();
            let contract = get_contract_address();
            let token_addr = self.campaign_token.read(campaign_id);

            // Transfer tokens from backer to escrow
            let token = IERC20Dispatcher { contract_address: token_addr };
            token.transfer_from(caller, contract, amount);

            // Update contribution
            let existing = self.contributions.read((campaign_id, caller));
            if existing == 0 {
                let count = self.campaign_backer_count.read(campaign_id);
                self.campaign_backer_count.write(campaign_id, count + 1);
            }
            self.contributions.write((campaign_id, caller), existing + amount);

            // Update raised
            let raised = self.campaign_raised.read(campaign_id);
            self.campaign_raised.write(campaign_id, raised + amount);

            self.emit(Contributed { campaign_id, backer: caller, amount });
        }

        fn withdraw(ref self: ContractState, campaign_id: felt252) {
            assert(self.campaign_exists.read(campaign_id), 'Campaign does not exist');

            let caller = get_caller_address();
            let founder = self.campaign_founder.read(campaign_id);
            assert(caller == founder, 'Only founder can withdraw');

            let raised = self.campaign_raised.read(campaign_id);
            let goal = self.campaign_goal.read(campaign_id);
            assert(raised >= goal, 'Goal not reached');
            assert(!self.campaign_withdrawn.read(campaign_id), 'Already withdrawn');
            assert(!self.campaign_refunded.read(campaign_id), 'Was refunded');

            // Calculate platform fee
            let fee_bps: u256 = self.platform_fee_bps.read().into();
            let fee = (raised * fee_bps) / 10000;
            let founder_amount = raised - fee;

            let token_addr = self.campaign_token.read(campaign_id);
            let token = IERC20Dispatcher { contract_address: token_addr };

            // Transfer to founder
            token.transfer(founder, founder_amount);

            // Transfer fee to platform
            if fee > 0 {
                token.transfer(self.platform_wallet.read(), fee);
            }

            self.campaign_withdrawn.write(campaign_id, true);

            self.emit(Withdrawn { campaign_id, founder: caller, amount: founder_amount, fee });
        }

        fn refund(ref self: ContractState, campaign_id: felt252) {
            assert(self.campaign_exists.read(campaign_id), 'Campaign does not exist');
            assert(!self.campaign_withdrawn.read(campaign_id), 'Already withdrawn');
            assert(!self.campaign_refunded.read(campaign_id), 'Already refunded');

            let deadline_passed = get_block_timestamp() >= self.campaign_deadline.read(campaign_id);
            let raised = self.campaign_raised.read(campaign_id);
            let goal = self.campaign_goal.read(campaign_id);
            let under_goal = raised < goal;

            let backer_count = self.campaign_backer_count.read(campaign_id);
            let votes = self.campaign_refund_votes.read(campaign_id);
            let vote_threshold_met = backer_count > 0 && votes > backer_count / 2;

            assert(
                (deadline_passed && under_goal) || vote_threshold_met,
                'Refund conditions not met'
            );

            self.campaign_refunded.write(campaign_id, true);
            self.emit(Refunded { campaign_id });
        }

        fn claim_refund(ref self: ContractState, campaign_id: felt252) {
            assert(self.campaign_exists.read(campaign_id), 'Campaign does not exist');
            assert(self.campaign_refunded.read(campaign_id), 'Not refunded yet');

            let caller = get_caller_address();
            let amount = self.contributions.read((campaign_id, caller));
            assert(amount > 0, 'Nothing to refund');

            // Zero out contribution (prevent double claim)
            self.contributions.write((campaign_id, caller), 0);

            // Transfer back to backer
            let token_addr = self.campaign_token.read(campaign_id);
            let token = IERC20Dispatcher { contract_address: token_addr };
            token.transfer(caller, amount);

            self.emit(RefundClaimed { campaign_id, backer: caller, amount });
        }

        fn vote_refund(ref self: ContractState, campaign_id: felt252) {
            assert(self.campaign_exists.read(campaign_id), 'Campaign does not exist');
            assert(!self.campaign_withdrawn.read(campaign_id), 'Already withdrawn');
            assert(!self.campaign_refunded.read(campaign_id), 'Already refunded');

            let caller = get_caller_address();
            let contribution = self.contributions.read((campaign_id, caller));
            assert(contribution > 0, 'Only backers can vote');
            assert(!self.voted.read((campaign_id, caller)), 'Already voted');

            self.voted.write((campaign_id, caller), true);
            let votes = self.campaign_refund_votes.read(campaign_id);
            self.campaign_refund_votes.write(campaign_id, votes + 1);

            self.emit(VotedRefund { campaign_id, voter: caller });
        }

        fn get_raised(self: @ContractState, campaign_id: felt252) -> u256 {
            self.campaign_raised.read(campaign_id)
        }

        fn get_goal(self: @ContractState, campaign_id: felt252) -> u256 {
            self.campaign_goal.read(campaign_id)
        }

        fn get_backer_count(self: @ContractState, campaign_id: felt252) -> u32 {
            self.campaign_backer_count.read(campaign_id)
        }

        fn get_refund_votes(self: @ContractState, campaign_id: felt252) -> u32 {
            self.campaign_refund_votes.read(campaign_id)
        }

        fn get_contribution(
            self: @ContractState, campaign_id: felt252, backer: ContractAddress
        ) -> u256 {
            self.contributions.read((campaign_id, backer))
        }

        fn is_withdrawn(self: @ContractState, campaign_id: felt252) -> bool {
            self.campaign_withdrawn.read(campaign_id)
        }

        fn is_refunded(self: @ContractState, campaign_id: felt252) -> bool {
            self.campaign_refunded.read(campaign_id)
        }

        fn get_platform_wallet(self: @ContractState) -> ContractAddress {
            self.platform_wallet.read()
        }

        fn get_platform_fee_bps(self: @ContractState) -> u16 {
            self.platform_fee_bps.read()
        }
    }
}