<?php
/**
 * Plugin Name: Pilot Connector
 * Description: Envoie les evenements WordPress et WooCommerce vers Pilot via webhook.
 * Version: 1.0.0
 * Author: Pilot
 */

if (!defined('ABSPATH')) {
    exit;
}

define('PILOT_CONNECTOR_OPTION_KEY', 'pilot_connector_settings');

function pilot_connector_default_settings() {
    return array(
        'webhook_url' => '',
        'secret' => '',
    );
}

function pilot_connector_get_settings() {
    $settings = get_option(PILOT_CONNECTOR_OPTION_KEY, array());
    return wp_parse_args($settings, pilot_connector_default_settings());
}

function pilot_connector_sanitize_settings($input) {
    return array(
        'webhook_url' => isset($input['webhook_url']) ? esc_url_raw(trim((string) $input['webhook_url'])) : '',
        'secret' => isset($input['secret']) ? sanitize_text_field((string) $input['secret']) : '',
    );
}

function pilot_connector_register_settings() {
    register_setting(
        'pilot_connector_settings_group',
        PILOT_CONNECTOR_OPTION_KEY,
        'pilot_connector_sanitize_settings'
    );
}
add_action('admin_init', 'pilot_connector_register_settings');

function pilot_connector_add_settings_page() {
    add_options_page(
        'Pilot Connector',
        'Pilot Connector',
        'manage_options',
        'pilot-connector',
        'pilot_connector_render_settings_page'
    );
}
add_action('admin_menu', 'pilot_connector_add_settings_page');

function pilot_connector_render_settings_page() {
    if (!current_user_can('manage_options')) {
        return;
    }

    $settings = pilot_connector_get_settings();
    ?>
    <div class="wrap">
        <h1>Pilot Connector</h1>
        <p>Collez l'URL du webhook Pilot et le secret partage.</p>
        <form method="post" action="options.php">
            <?php settings_fields('pilot_connector_settings_group'); ?>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="pilot_connector_webhook_url">Webhook URL</label></th>
                    <td>
                        <input
                            type="url"
                            class="regular-text"
                            id="pilot_connector_webhook_url"
                            name="<?php echo esc_attr(PILOT_CONNECTOR_OPTION_KEY); ?>[webhook_url]"
                            value="<?php echo esc_attr($settings['webhook_url']); ?>"
                            placeholder="https://api.example.com/api/v1/integrations/wordpress/webhook/tenant-id"
                        />
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="pilot_connector_secret">Secret</label></th>
                    <td>
                        <input
                            type="text"
                            class="regular-text"
                            id="pilot_connector_secret"
                            name="<?php echo esc_attr(PILOT_CONNECTOR_OPTION_KEY); ?>[secret]"
                            value="<?php echo esc_attr($settings['secret']); ?>"
                        />
                    </td>
                </tr>
            </table>
            <?php submit_button('Save Connector Settings'); ?>
        </form>
    </div>
    <?php
}

function pilot_connector_send_webhook($event, $payload) {
    $settings = pilot_connector_get_settings();
    $webhook_url = trim((string) $settings['webhook_url']);

    if ($webhook_url === '') {
        return;
    }

    wp_remote_post(
        $webhook_url,
        array(
            'timeout' => 10,
            'headers' => array(
                'Content-Type' => 'application/json',
                'x-wp-event' => $event,
                'x-wp-secret' => (string) $settings['secret'],
            ),
            'body' => wp_json_encode($payload),
        )
    );
}

function pilot_connector_build_user_payload($user_id) {
    $user = get_userdata($user_id);

    if (!$user) {
        return null;
    }

    return array(
        'ID' => $user->ID,
        'email' => $user->user_email,
        'display_name' => $user->display_name,
        'user_registered' => $user->user_registered,
        'roles' => array_values((array) $user->roles),
    );
}

function pilot_connector_on_user_register($user_id) {
    $payload = pilot_connector_build_user_payload($user_id);

    if ($payload) {
        pilot_connector_send_webhook('user_register', $payload);
    }
}
add_action('user_register', 'pilot_connector_on_user_register', 10, 1);

function pilot_connector_on_profile_update($user_id) {
    $payload = pilot_connector_build_user_payload($user_id);

    if ($payload) {
        pilot_connector_send_webhook('user_updated', $payload);
    }
}
add_action('profile_update', 'pilot_connector_on_profile_update', 10, 1);

function pilot_connector_on_woocommerce_order_status_changed($order_id, $status_from, $status_to, $order) {
    $payload = array(
        'order_id' => $order_id,
        'status_from' => $status_from,
        'status_to' => $status_to,
        'customer_id' => $order ? $order->get_customer_id() : null,
        'billing_email' => $order ? $order->get_billing_email() : null,
        'total' => $order ? $order->get_total() : null,
    );

    pilot_connector_send_webhook('woocommerce_order_status_changed', $payload);
}

if (class_exists('WooCommerce')) {
    add_action(
        'woocommerce_order_status_changed',
        'pilot_connector_on_woocommerce_order_status_changed',
        10,
        4
    );
}
