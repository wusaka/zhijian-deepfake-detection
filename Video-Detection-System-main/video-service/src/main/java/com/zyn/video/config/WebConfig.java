package com.zyn.video.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.web.servlet.config.annotation.ContentNegotiationConfigurer;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Web配置 - Content-Type 协商
 * 注意：/uploads/** 的静态资源已由 VideoStreamController 处理（支持 Range 请求），
 * 此处不再注册 addResourceHandler。
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void configureContentNegotiation(ContentNegotiationConfigurer configurer) {
        configurer.favorPathExtension(true)
                .useRegisteredExtensionsOnly(false)
                .defaultContentType(MediaType.APPLICATION_OCTET_STREAM)
                .mediaType("mp4", MediaType.valueOf("video/mp4"))
                .mediaType("webm", MediaType.valueOf("video/webm"))
                .mediaType("mov", MediaType.valueOf("video/quicktime"))
                .mediaType("jpg", MediaType.IMAGE_JPEG)
                .mediaType("jpeg", MediaType.IMAGE_JPEG)
                .mediaType("png", MediaType.IMAGE_PNG);
    }
}
