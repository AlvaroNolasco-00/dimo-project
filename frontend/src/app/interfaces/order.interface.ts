export interface UserBasic {
    id: number;
    full_name: string;
}

export interface OrderHistory {
    id: number;
    order_id: number;
    user_id?: number;
    user?: UserBasic;
    action_type: string;
    description: string;
    created_at: string;
}
