<?php
/**
 * CabinGen - Image Proxy for cPanel / Shared Hosting
 * Proxies boat / cabin images or redirects to image CDN
 */
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: *');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$url = isset($_GET['url']) ? trim($_GET['url']) : '';
$fileId = isset($_GET['id']) ? trim($_GET['id']) : '';

$targetUrl = '';
if (!empty($url)) {
    $targetUrl = $url;
} elseif (!empty($fileId)) {
    $targetUrl = "https://lh3.googleusercontent.com/d/" . urlencode($fileId);
}

if (empty($targetUrl)) {
    http_response_code(400);
    echo 'Missing target URL or id parameter';
    exit;
}

// Check if cURL is available to fetch and stream image
if (function_exists('curl_init')) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $targetUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    $imageData = curl_exec($ch);
    $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($imageData !== false && $httpCode === 200 && !empty($imageData)) {
        header('Content-Type: ' . ($contentType ?: 'image/jpeg'));
        header('Cache-Control: public, max-age=86400');
        echo $imageData;
        exit;
    }
}

// Redirect fallback to wsrv.nl image proxy CDN
header("Location: https://wsrv.nl/?url=" . urlencode($targetUrl), true, 302);
exit;
