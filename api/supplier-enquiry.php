<?php
/**
 * AL NOKHBA TRADING — supplier proposal handler (Hostinger / PHP hosting).
 *
 * Receives the multipart form posted by /become-a-supplier and emails it,
 * with any uploaded catalogue / product list attached, to the procurement
 * mailbox. Responds with JSON: {"ok":true} or {"ok":false,"error":"..."}.
 *
 * Mirrors src/lib/supplier-enquiry.ts (field names, options and limits).
 */

declare(strict_types=1);

const TO_EMAIL   = 'Manager@alnokhbatrading.com';
// Use a mailbox that exists on the domain (create it in hPanel → Emails)
// so messages are not rejected as spoofed.
const FROM_EMAIL = 'website@alnokhbatrading.com';
const FROM_NAME  = 'AL NOKHBA Website';

const MAX_FILE_BYTES  = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXT = ['pdf', 'xls', 'xlsx', 'csv', 'doc', 'docx', 'ppt', 'pptx', 'zip', 'jpg', 'jpeg', 'png'];

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function respond(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    respond(405, ['ok' => false, 'error' => 'method_not_allowed']);
}

// Same-origin check (browsers send Origin on fetch POST).
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && !preg_match('#^https?://(www\.)?alnokhbatrading\.com$#i', $origin)) {
    respond(403, ['ok' => false, 'error' => 'forbidden']);
}

// Honeypot: real visitors never fill this field.
if (trim((string)($_POST['fax'] ?? '')) !== '') {
    respond(200, ['ok' => true]);
}

$labels = [
    'companyName'       => 'Company Name',
    'country'           => 'Country',
    'website'           => 'Company Website',
    'contactPerson'     => 'Contact Person',
    'jobTitle'          => 'Job Title',
    'email'             => 'Business Email',
    'phone'             => 'Telephone / WhatsApp',
    'productCategory'   => 'Product Category',
    'productBrands'     => 'Product / Brand Names',
    'companyType'       => 'Company Type',
    'uaeDistributor'    => 'Existing UAE Distributor?',
    'exportMarkets'     => 'Current Export Markets',
    'moq'               => 'MOQ',
    'leadTime'          => 'Typical Order Lead Time',
    'stockAvailability' => 'Current Stock Availability',
    'orderValue'        => 'Indicative Wholesale Order Value',
    'canExportUae'      => 'Can you export to the UAE?',
    'message'           => 'Message',
];

$maxLen = [
    'companyName' => 160, 'country' => 80, 'website' => 200, 'contactPerson' => 120, 'jobTitle' => 120,
    'email' => 160, 'phone' => 40, 'productCategory' => 80, 'productBrands' => 300, 'companyType' => 40,
    'uaeDistributor' => 10, 'exportMarkets' => 300, 'moq' => 200, 'leadTime' => 200,
    'stockAvailability' => 60, 'orderValue' => 40, 'canExportUae' => 30, 'message' => 4000,
];

$data = [];
foreach ($labels as $key => $_) {
    $v = trim((string)($_POST[$key] ?? ''));
    // Strip control characters (keeps newlines/tabs in the message).
    $v = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $v) ?? '';
    if (mb_strlen($v) > $maxLen[$key]) {
        respond(422, ['ok' => false, 'error' => 'validation']);
    }
    $data[$key] = $v;
}

$categories = [
    'Professional Cleaning & Hygiene', 'Hardware & Technical Supplies', 'Industrial & Maintenance Supplies',
    'Building & Renovation Supplies', 'Home & Interior Products', 'Hospitality & Catering Supplies',
    'Non-Food Consumer Goods', 'General Wholesale Trading / Other',
];

$valid =
    mb_strlen($data['companyName']) >= 2 &&
    mb_strlen($data['country']) >= 2 &&
    preg_match('#^(https?://)?([\w-]+\.)+[a-z]{2,}(/\S*)?$#i', $data['website']) &&
    mb_strlen($data['contactPerson']) >= 2 &&
    filter_var($data['email'], FILTER_VALIDATE_EMAIL) &&
    preg_match('/^[+()\d\s.-]{6,}$/', $data['phone']) &&
    in_array($data['productCategory'], $categories, true);

if (!$valid) {
    respond(422, ['ok' => false, 'error' => 'validation']);
}

// Attachments
$attachments = [];
$total = 0;
foreach (['catalogue' => 'Catalogue', 'productList' => 'Product List'] as $field => $label) {
    if (!isset($_FILES[$field]) || ($_FILES[$field]['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        continue;
    }
    $f = $_FILES[$field];
    if ($f['error'] === UPLOAD_ERR_INI_SIZE || $f['error'] === UPLOAD_ERR_FORM_SIZE) {
        respond(413, ['ok' => false, 'error' => 'file_too_large']);
    }
    if ($f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) {
        respond(422, ['ok' => false, 'error' => 'invalid_file']);
    }
    $name = basename((string)$f['name']);
    $name = preg_replace('/[^\w.\- ()]/u', '_', $name) ?: 'attachment';
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if (!in_array($ext, ALLOWED_EXT, true)) {
        respond(422, ['ok' => false, 'error' => 'invalid_file']);
    }
    if ($f['size'] > MAX_FILE_BYTES) {
        respond(413, ['ok' => false, 'error' => 'file_too_large']);
    }
    $total += (int)$f['size'];
    $attachments[] = ['label' => $label, 'name' => $name, 'path' => $f['tmp_name']];
}
if ($total > MAX_TOTAL_BYTES) {
    respond(413, ['ok' => false, 'error' => 'file_too_large']);
}

// Compose message
$lines = ['New supplier proposal submitted via alnokhbatrading.com', ''];
foreach ($labels as $key => $label) {
    if ($key === 'message') continue;
    $lines[] = $label . ': ' . ($data[$key] !== '' ? $data[$key] : '—');
}
$lines[] = '';
$lines[] = 'Message:';
$lines[] = $data['message'] !== '' ? $data['message'] : '—';
$lines[] = '';
$lines[] = 'Attachments: ' . ($attachments
    ? implode(', ', array_map(fn($a) => "{$a['label']} ({$a['name']})", $attachments))
    : 'none');
$text = implode("\r\n", $lines);

$oneLine = fn(string $s) => str_replace(["\r", "\n"], ' ', $s);
$subject = 'Supplier proposal: ' . $oneLine($data['companyName']) . ' (' . $oneLine($data['country']) . ') — '
    . $data['productCategory'];
$encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';

$boundary = 'b' . bin2hex(random_bytes(12));
$headers = [
    'MIME-Version: 1.0',
    'From: =?UTF-8?B?' . base64_encode(FROM_NAME) . '?= <' . FROM_EMAIL . '>',
    'Reply-To: ' . $data['email'],
    'Content-Type: multipart/mixed; boundary="' . $boundary . '"',
];

$body  = "--{$boundary}\r\n";
$body .= "Content-Type: text/plain; charset=UTF-8\r\n";
$body .= "Content-Transfer-Encoding: base64\r\n\r\n";
$body .= chunk_split(base64_encode($text)) . "\r\n";
foreach ($attachments as $a) {
    $content = file_get_contents($a['path']);
    if ($content === false) {
        respond(500, ['ok' => false, 'error' => 'invalid_file']);
    }
    $body .= "--{$boundary}\r\n";
    $body .= "Content-Type: application/octet-stream; name=\"{$a['name']}\"\r\n";
    $body .= "Content-Transfer-Encoding: base64\r\n";
    $body .= "Content-Disposition: attachment; filename=\"{$a['name']}\"\r\n\r\n";
    $body .= chunk_split(base64_encode($content)) . "\r\n";
}
$body .= "--{$boundary}--";

$sent = mail(TO_EMAIL, $encodedSubject, $body, implode("\r\n", $headers), '-f' . FROM_EMAIL);

if (!$sent) {
    error_log('[supplier-enquiry] mail() failed');
    respond(502, ['ok' => false, 'error' => 'delivery_failed']);
}
respond(200, ['ok' => true]);
