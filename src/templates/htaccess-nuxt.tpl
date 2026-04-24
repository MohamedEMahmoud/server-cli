# php -- BEGIN cPanel-generated handler, do not edit
# Set the “ea-php73” package as the default “PHP” programming language.

<IfModule mod_rewrite.c>
RewriteEngine On

# 🔥 Firebase Service Worker – direct serve (NO proxy)
RewriteRule ^firebase-messaging-sw\.js$ - [L]

</IfModule>

<Files "firebase-messaging-sw.js">
ForceType application/javascript
Header set Service-Worker-Allowed "/"
Header set Cache-Control "no-cache, no-store, must-revalidate"
</Files>
# php -- BEGIN cPanel-generated handler, do not edit
# Set the “ea-php73” package as the default “PHP” programming language.

<IfModule mod_rewrite.c>
RewriteEngine On

# RewriteCond %{HTTP_HOST} ^www\. [NC]
# RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
RewriteCond %{HTTP_HOST} ^www\.(.*)$ [NC]
RewriteRule ^(.*)$ https://%1/$1 [L,R=301]
# RewriteRule ^.*_nuxt.*$ / [R=301,L]
# RewriteCond %{SERVER_PORT} 80
RewriteCond %{SERVER_PORT} !=80 [OR]
RewriteCond %{SERVER_PORT} !=443
RewriteRule ^index.php(.*) http://%{HTTP_HOST}:{{PORT}}/$1 [P,L,E=no-gzip:1]

# Serve /imgs/ directly from .output/public/imgs/ — bypass Node proxy
RewriteCond %{DOCUMENT_ROOT}/.output/public/$1 -f
RewriteRule ^(imgs/.+)$ .output/public/$1 [L]

# Serve other static assets directly if they exist on disk
RewriteCond %{REQUEST_URI} \.(svg|svgz|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot|otf|css|js|map|pdf|mp4|webm|ogg|mp3|wav|flv|swf|bmp)$ [NC]
RewriteCond %{REQUEST_FILENAME} -f
RewriteRule ^ - [L]

RewriteRule (.*) http://%{HTTP_HOST}:{{PORT}}/$1 [P,L,E=no-gzip:1]

</IfModule>
<IfModule mod_deflate.c>
AddOutputFilterByType DEFLATE application/javascript
AddOutputFilterByType DEFLATE application/rss+xml
AddOutputFilterByType DEFLATE application/vnd.ms-fontobject
AddOutputFilterByType DEFLATE application/x-font
AddOutputFilterByType DEFLATE application/x-font-opentype
AddOutputFilterByType DEFLATE application/x-font-otf
AddOutputFilterByType DEFLATE application/x-font-truetype
AddOutputFilterByType DEFLATE application/x-font-ttf
AddOutputFilterByType DEFLATE application/x-javascript
AddOutputFilterByType DEFLATE application/xhtml+xml
AddOutputFilterByType DEFLATE application/xml
AddOutputFilterByType DEFLATE font/opentype
AddOutputFilterByType DEFLATE font/otf
AddOutputFilterByType DEFLATE font/ttf
AddOutputFilterByType DEFLATE image/svg+xml
AddOutputFilterByType DEFLATE image/x-icon
AddOutputFilterByType DEFLATE text/css
AddOutputFilterByType DEFLATE text/html
AddOutputFilterByType DEFLATE text/javascript
AddOutputFilterByType DEFLATE text/plain
AddOutputFilterByType DEFLATE text/xml

BrowserMatch ^Mozilla/4 gzip-only-text/html
BrowserMatch ^Mozilla/4\.0[678] no-gzip
BrowserMatch \bMSIE !no-gzip !gzip-only-text/html
Header append Vary User-Agent
</IfModule>

<IfModule mod_headers.c>
RewriteEngine On
RewriteCond "%{HTTP:Accept-encoding}" "br"
RewriteCond "%{REQUEST_FILENAME}.br" -s
RewriteRule "^(.*)\.(html|css|js)$" "/$1.$2.br" [QSA]
RewriteRule "\.html\.br$" "-" [T=text/html,E=no-brotli:1,E=no-gzip:1]
RewriteRule "\.css\.br$" "-" [T=text/css,E=no-brotli:1,E=no-gzip:1]
RewriteRule "\.js\.br$" "-" [T=text/javascript,E=no-brotli:1,E=no-gzip:1]
RewriteCond "%{HTTP:Accept-encoding}" "gzip"
RewriteCond "%{REQUEST_FILENAME}.gz" -s
RewriteRule "^(.*)\.(html|css|js)$" "/$1.$2.gz" [QSA]
RewriteRule "\.html\.gz$" "-" [T=text/html,E=no-brotli:1,E=no-gzip:1]
RewriteRule "\.css\.gz$" "-" [T=text/css,E=no-brotli:1,E=no-gzip:1]
RewriteRule "\.js\.gz$" "-" [T=text/javascript,E=no-brotli:1,E=no-gzip:1]

<FilesMatch "(\.html\.br|\.js\.br|\.css\.br)$">
Header append Content-Encoding br
Header append Vary Accept-Encoding
</FilesMatch>
<FilesMatch "(\.html\.gz|\.js\.gz|\.css\.gz)$">
Header append Content-Encoding gzip
Header append Vary Accept-Encoding
</FilesMatch>

# Do not cache HTML documents (including proxied app routes).
Header set Cache-Control "no-cache, no-store, must-revalidate" "expr=%{CONTENT_TYPE} =~ m#text/html#"

# Images and fonts — 1 month cache
<FilesMatch "\.(svg|svgz|flv|gif|ico|jpg|jpeg|mp4|mpeg|png|swf|webp|bmp|ttf|eot|woff|woff2|otf)$">
  Header set Cache-Control "max-age=2592000, public"
</FilesMatch>

# One month for JavaScript and PDF files
<FilesMatch ".(js|pdf)$">
Header set Cache-Control "max-age=2592000, public"
</FilesMatch>

# One week for CSS files
<FilesMatch ".(css)$">
Header set Cache-Control "max-age=604800, public"
</FilesMatch>


SetEnvIfNoCase ^(Accept-EncodXng|X-cept-Encoding|X{15}|~{15}|-{15})$ ^((gzip|deflate)\s*,?\s*)+|[X~-]{4,13}$ HAVE_Accept-Encoding
RequestHeader append Accept-Encoding "gzip,deflate" env=HAVE_Accept-Encoding
</IfModule>

<IfModule mod_expires.c>
ExpiresActive on
ExpiresDefault "access plus 1 month"

# CSS

ExpiresByType text/css "access plus 1 month"

# Data interchange

ExpiresByType application/atom+xml "access plus 1 hour"
ExpiresByType application/rdf+xml "access plus 1 hour"
ExpiresByType application/rss+xml "access plus 1 hour"

ExpiresByType application/json "access plus 0 seconds"
ExpiresByType application/ld+json "access plus 0 seconds"
ExpiresByType application/schema+json "access plus 0 seconds"
ExpiresByType application/vnd.geo+json "access plus 0 seconds"
ExpiresByType application/xml "access plus 0 seconds"
ExpiresByType text/xml "access plus 0 seconds"

# Favicon (cannot be renamed!) and cursor images

ExpiresByType image/vnd.microsoft.icon "access plus 1 week"
# ExpiresByType image/x-icon "access plus 1 week"

# HTML

ExpiresByType text/html "access plus 0 seconds"

# JavaScript

ExpiresByType application/javascript "access plus 1 year"
ExpiresByType application/x-javascript "access plus 1 year"
ExpiresByType text/javascript "access plus 1 year"

# Manifest files

ExpiresByType application/manifest+json "access plus 1 week"
ExpiresByType application/x-web-app-manifest+json "access plus 0 seconds"
ExpiresByType text/cache-manifest "access plus 0 seconds"

# Media files

ExpiresByType audio/ogg "access plus 1 month"
ExpiresByType image/bmp "access plus 1 month"
ExpiresByType image/gif "access plus 1 month"
ExpiresByType image/jpg "access plus 1 month"
ExpiresByType image/jpeg "access plus 1 month"
ExpiresByType image/png "access plus 1 month"
ExpiresByType image/svg+xml "access plus 1 month"
ExpiresByType image/webp "access plus 1 month"
ExpiresByType video/mp4 "access plus 1 month"
ExpiresByType video/ogg "access plus 1 month"
ExpiresByType video/webm "access plus 1 month"

# Web fonts

# Embedded OpenType (EOT)
ExpiresByType application/vnd.ms-fontobject "access plus 1 month"
ExpiresByType font/eot "access plus 1 month"

# OpenType
ExpiresByType font/opentype "access plus 1 month"

# TrueType
ExpiresByType application/x-font-ttf "access plus 1 month"

# Web Open Font Format (WOFF) 1.0
ExpiresByType application/font-woff "access plus 1 month"
ExpiresByType application/x-font-woff "access plus 1 month"
ExpiresByType font/woff "access plus 1 month"

# Web Open Font Format (WOFF) 2.0
ExpiresByType application/font-woff2 "access plus 1 month"

# Other

ExpiresByType text/x-cross-domain-policy "access plus 1 week"
</IfModule>
# php -- BEGIN cPanel-generated handler, do not edit
# Set the “ea-php81” package as the default “PHP” programming language.
<IfModule mime_module>
AddHandler application/x-httpd-ea-php81 .php .php8 .phtml
AddType image/svg+xml .svg .svgz
AddEncoding gzip .svgz
</IfModule>
# php -- END cPanel-generated handler, do not edit
