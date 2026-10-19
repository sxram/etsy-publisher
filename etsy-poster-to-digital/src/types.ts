export type EtsyToken = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  obtained_at: number;
};

export type EtsyMoney = {
  amount: number;
  divisor: number;
  currency_code: string;
};

export type EtsyListingImage = {
  listing_image_id: number;
  rank?: number;
  url_fullxfull?: string;
  alt_text?: string;
};

export type EtsyListing = {
  listing_id: number;
  shop_id: number;
  title: string;
  description?: string;
  state: string;
  quantity?: number;
  url?: string;
  num_favorers?: number;
  listing_type?: string;
  type?: string;
  tags?: string[];
  price?: EtsyMoney;
  taxonomy_id?: number;
  shop_section_id?: number | null;
  shipping_profile_id?: number | null;
  who_made?: string;
  when_made?: string;
  is_supply?: boolean;
  images?: EtsyListingImage[];
};

export type EtsyShop = {
  shop_id: number;
  user_id: number;
  shop_name: string;
  listing_active_count?: number;
  digital_listing_count?: number;
};

export type DigitalFileGroup = {
  key: string;
  displayName: string;
  files: string[];
};

export type EtsyListingFile = {
  listing_file_id: number;
  listing_id: number;
  rank: number;
  filename: string;
  filesize?: string;
  size_bytes?: number;
  filetype?: string;
  create_timestamp?: number;
  created_timestamp?: number;
};
