package com.zyn.video.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;

/**
 * 视频流媒体控制器 — 支持 HTTP Range 请求实现浏览器内联播放
 * 替代默认的静态资源处理器，解决视频被浏览器下载而非播放的问题
 */
@RestController
@RequestMapping("/uploads")
public class VideoStreamController {

    @Value("${file.storage.upload-dir:./uploads}")
    private String uploadDir;

    // 常见视频/图片 MIME 类型映射
    private static final Map<String, String> MIME_MAP = Map.ofEntries(
            Map.entry("mp4", "video/mp4"),
            Map.entry("webm", "video/webm"),
            Map.entry("mov", "video/quicktime"),
            Map.entry("avi", "video/x-msvideo"),
            Map.entry("mkv", "video/x-matroska"),
            Map.entry("flv", "video/x-flv"),
            Map.entry("wmv", "video/x-ms-wmv"),
            Map.entry("jpg", "image/jpeg"),
            Map.entry("jpeg", "image/jpeg"),
            Map.entry("png", "image/png"),
            Map.entry("gif", "image/gif"),
            Map.entry("webp", "image/webp")
    );

    /**
     * 流式服务上传的媒体文件
     * 支持 Range 请求 (HTTP 206 Partial Content) 实现视频的浏览器内预览
     */
    @GetMapping("/**")
    public ResponseEntity<Resource> streamMedia(HttpServletRequest request) throws IOException {
        // 提取 /uploads/ 后面的路径
        String fullPath = request.getRequestURI();
        String relativePath = fullPath.substring("/uploads/".length());

        // 安全校验：防止路径穿越攻击
        if (relativePath.contains("..") || relativePath.contains("\\..")) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        Path filePath = Paths.get(uploadDir).resolve(relativePath).normalize();

        // 确保文件在 uploads 目录内
        if (!filePath.startsWith(Paths.get(uploadDir).normalize())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        if (!Files.exists(filePath) || !Files.isRegularFile(filePath)) {
            return ResponseEntity.notFound().build();
        }

        long fileSize = Files.size(filePath);
        String fileName = filePath.getFileName().toString();
        String ext = fileName.contains(".") ? fileName.substring(fileName.lastIndexOf('.') + 1).toLowerCase() : "";
        MediaType mediaType = MediaType.parseMediaType(MIME_MAP.getOrDefault(ext, "application/octet-stream"));

        Resource resource = new FileSystemResource(filePath);

        // 处理 Range 请求
        String rangeHeader = request.getHeader(HttpHeaders.RANGE);

        if (rangeHeader != null && rangeHeader.startsWith("bytes=")) {
            // 解析 Range: bytes=start-end
            String[] ranges = rangeHeader.substring("bytes=".length()).split("-");
            long start = Long.parseLong(ranges[0]);
            long end = ranges.length > 1 && !ranges[1].isEmpty() ? Long.parseLong(ranges[1]) : fileSize - 1;

            // 边界校验
            if (start >= fileSize) {
                return ResponseEntity.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                        .header(HttpHeaders.CONTENT_RANGE, "bytes */" + fileSize)
                        .build();
            }
            end = Math.min(end, fileSize - 1);
            long contentLength = end - start + 1;

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(mediaType);
            headers.set(HttpHeaders.ACCEPT_RANGES, "bytes");
            headers.set(HttpHeaders.CONTENT_RANGE, "bytes " + start + "-" + end + "/" + fileSize);
            headers.setContentLength(contentLength);
            headers.set(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + fileName + "\"");
            headers.setCacheControl(CacheControl.maxAge(java.time.Duration.ofHours(1)).cachePublic());

            // 使用 InputStreamResource 支持 Range 读取
            var inputStream = Files.newInputStream(filePath);
            inputStream.skip(start);
            var limitedStream = new org.springframework.core.io.InputStreamResource(
                    new java.io.FilterInputStream(inputStream) {
                        private long remaining = contentLength;
                        @Override
                        public int read() throws IOException {
                            if (remaining <= 0) return -1;
                            int b = super.read();
                            if (b != -1) remaining--;
                            return b;
                        }
                        @Override
                        public int read(byte[] buf, int off, int len) throws IOException {
                            if (remaining <= 0) return -1;
                            int toRead = (int) Math.min(len, remaining);
                            int n = super.read(buf, off, toRead);
                            if (n > 0) remaining -= n;
                            return n;
                        }
                    }
            );

            return ResponseEntity.status(HttpStatus.PARTIAL_CONTENT)
                    .headers(headers)
                    .body(limitedStream);
        }

        // 无 Range 请求 — 返回完整内容，带 Accept-Ranges 头
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(mediaType);
        headers.setContentLength(fileSize);
        headers.set(HttpHeaders.ACCEPT_RANGES, "bytes");
        headers.set(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + fileName + "\"");
        headers.setCacheControl(CacheControl.maxAge(java.time.Duration.ofHours(1)).cachePublic());

        return ResponseEntity.ok()
                .headers(headers)
                .body(resource);
    }
}
