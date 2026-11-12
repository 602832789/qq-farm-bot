# 上游 NapCat 源码仓库已下线，:latest 是浮动标签且不再有可用性保证。生产部署请用
# --build-arg NAPCAT_IMAGE=mlikiowa/napcat-docker:<版本号> 固定版本，或先 docker load
# 归档的镜像 tar 再指向本地标签；两种做法见 docs/detailed-reference.md 的「部署细节」。
ARG NAPCAT_IMAGE=mlikiowa/napcat-docker:latest
FROM ${NAPCAT_IMAGE}

COPY napcat/plugins/qq-miniapp-openauth /opt/qq-farm-bot/qq-miniapp-openauth
COPY napcat/docker-entrypoint.sh /usr/local/bin/qq-farm-napcat-entrypoint

RUN chmod +x /usr/local/bin/qq-farm-napcat-entrypoint

ENTRYPOINT ["/usr/local/bin/qq-farm-napcat-entrypoint"]
