export type SportmonksResponse<T = void> = {
  data?: T;
  message: string;
  pagination?: {
    count: number;
    per_page: number;
    current_page: number;
    next_page: number;
    has_more: boolean;
  };
  rate_limit: {
    resets_in_seconds: number;
    remaining: number;
    requested_entity: string;
  };
  timezone: string;
};
