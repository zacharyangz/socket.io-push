module.exports = (config, arrivalStats, stats) => {
  return new XiaomiProvider(config, arrivalStats, stats);
};

const logger = require('winston-proxy')('XiaomiProvider');

const util = require('socket.io-push-redis/util');
const request = require('requestretry');
const sendOneUrl = "https://api.xmpush.xiaomi.com/v3/message/regid";
const sendAllUrl = "https://api.xmpush.xiaomi.com/v3/message/all";
const traceUrl = "https://api.xmpush.xiaomi.com/v1/trace/message/status";
const timeout = 5000;

class XiaomiProvider {

  constructor(config, arrivalStats, stats) {
    this.arrivalStats = arrivalStats;
    this.stats = stats;
    this.headers = {
      'Authorization': 'key=' + config.app_secret
    };
    this.type = "xiaomi";
    this.notify_foreground = (config.notify_foreground === 0) ? 0 : 1;
  }

  sendMany(notification, tokenDataList, timeToLive, callback) {
    if (notification.android.title) {
      this.stats.addTotal(this.type);
      request.post({
        url: sendOneUrl,
        form: this.getPostData(notification, tokenDataList, timeToLive),
        headers: this.headers,
        timeout: timeout,
        maxAttempts: 2,
        retryDelay: 5000,
        retryStrategy: request.RetryStrategies.NetworkError,
        time: true
      }, (error, response, body) => {
        logger.debug("sendOne result", error, response && response.statusCode, body);
        if (this.success(error, response, body, callback, notification.id)) {
          this.stats.addSuccess(this.type, 1, response.elapsedTime);
          return;
        }
        logger.error("sendOne error", error, response && response.statusCode, body);
      })
    }
  }

  getPostData(notification, tokenDataList, timeToLive) {
    logger.debug("getPostData notification ", notification, this.notify_foreground);
    const postData = {
      title: notification.android.title,
      description: notification.android.message,
      notify_id: util.hash(notification.id),
      "extra.notify_foreground": this.notify_foreground,
      payload: JSON.stringify({
        android: notification.android,
        id: notification.id
      })
    };
    if (tokenDataList) {
      postData.registration_id = tokenDataList.map((tokenData) => {
        return tokenData.token;
      }).join();
    }
    if (timeToLive > 0) {
      postData.time_to_live = timeToLive;
    } else {
      postData.time_to_live = 0;
    }
    return postData;
  }

  sendAll(notification, timeToLive, callback) {
    if (notification.android.title) {
      this.stats.addTotal(this.type + "All");
      request.post({
        url: sendAllUrl,
        form: this.getPostData(notification, 0, timeToLive),
        headers: this.headers,
        timeout: timeout,
        maxAttempts: 2,
        retryDelay: 5000,
        retryStrategy: request.RetryStrategies.NetworkError,
        time: true
      }, (error, response, body) => {
        logger.info("sendAll result", error, response && response.statusCode, body);
        if (this.success(error, response, body, callback, notification.id)) {
          this.stats.addSuccess(this.type + "All", 1, response.elapsedTime);
          return;
        }
        logger.error("sendAll error", error, response && response.statusCode, body);
      });
    }
  }

  success(error, response, body, callback, notificationId) {
    if (callback) {
      callback(error);
    }
    if (!error && response && response.statusCode == 200) {
      const result = JSON.parse(body);
      logger.debug("response result ", result);
      if (result.data && result.data.id) {
        this.arrivalStats.addArrivalInfo(notificationId, {}, {
          xiaomi_msg_id: result.data.id
        });
      }
      if (result.code == 0 || result.code == 20301) {
        return true;
      }
    }
    return false;
  }

  trace(packetInfo, callback) {
    if (packetInfo.xiaomi_msg_id) {
      request.get({
        url: traceUrl,
        qs: {
          msg_id: packetInfo.xiaomi_msg_id
        },
        headers: this.headers,
        timeout: timeout,
        maxAttempts: 2,
        retryDelay: 5000,
        retryStrategy: request.RetryStrategies.NetworkError
      }, (error, response, body) => {
        logger.info("trace result", error, response && response.statusCode, body);
        try {
          const result = JSON.parse(body);
          if (result.data && result.data.data) {
            delete packetInfo.xiaomi_msg_id;
            if (result.data.data.resolved > 0) {
              packetInfo.xiaomi = result.data.data;
            }
          }
        } catch (e) {}
        callback(packetInfo);
      });
    } else {
      callback(packetInfo);
    }
  }
}
