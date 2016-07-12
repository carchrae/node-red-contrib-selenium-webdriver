/**
 * Author: DUONG Dinh Cuong, cuong3ihut@gmail.com.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

module.exports = function(RED) {
	"use strict";
	var q = require('q');
	var util = require("util");
	var isReachable = require('is-reachable');
	var webdriver = require("selenium-webdriver"),
	    By = webdriver.By,
	    until = webdriver.until;
	var isUtf8 = require('is-utf8');

	function getAbsoluteXPath(driver, element) {
		return driver.executeScript("function absoluteXPath(element) {" + "var comp, comps = [];" + "var parent = null;" + "var xpath = '';" + "var getPos = function(element) {" + "var position = 1, curNode;" + "if (element.nodeType == Node.ATTRIBUTE_NODE) {" + "return null;" + "}" + "for (curNode = element.previousSibling; curNode; curNode = curNode.previousSibling){" + "if (curNode.nodeName == element.nodeName) {" + "++position;" + "}" + "}" + "return position;" + "};" + "if (element instanceof Document) {" + "return '/';" + "}" + "for (; element && !(element instanceof Document); element = element.nodeType == Node.ATTRIBUTE_NODE ? element.ownerElement : element.parentNode) {" + "comp = comps[comps.length] = {};" + "switch (element.nodeType) {" + "case Node.TEXT_NODE:" + "comp.name = 'text()';" + "break;" + "case Node.ATTRIBUTE_NODE:" + "comp.name = '@' + element.nodeName;" + "break;" + "case Node.PROCESSING_INSTRUCTION_NODE:" + "comp.name = 'processing-instruction()';" + "break;" + "case Node.COMMENT_NODE:" + "comp.name = 'comment()';" + "break;" + "case Node.ELEMENT_NODE:" + "comp.name = element.nodeName;" + "break;" + "}" + "comp.position = getPos(element);" + "}" + "for (var i = comps.length - 1; i >= 0; i--) {" + "comp = comps[i];" + "xpath += '/' + comp.name.toLowerCase();" + "if (comp.position !== null) {" + "xpath += '[' + comp.position + ']';" + "}" + "}" + "return xpath;" + "} return absoluteXPath(arguments[0]);", element);
	}

	function SeleniumServerSetup(n) {
		RED.nodes.createNode(this, n);

		this.connected = false;
		this.connecting = false;
		this.usecount = 0;
		// Config node state
		this.remoteurl = n.remoteurl;
		this.browser = n.browser;

		var node = this;
		this.register = function() {
			node.usecount += 1;
		};

		this.deregister = function() {
			node.usecount -= 1;
			if (node.usecount == 0) {
			}
		};

		this.connect = function() {
			var deferred = q.defer();
			if (!node.connected && !node.connecting) {
				node.connecting = true;
				var url = require('url').parse(node.remoteurl);
				isReachable(url.host, function(error, reachable) {
					if (!error && reachable) {
						node.driver = new webdriver.Builder().forBrowser(node.browser).usingServer(node.remoteurl);
						node.log(RED._("connected", {
							server : (node.browser ? node.browser + "@" : "") + node.remoteurl
						}));
						node.connected = true;
						node.emit('connected');
						deferred.resolve(node.driver);
					} else {
						node.connecting = false;
						node.connected = false;
						deferred.reject({
							Error : "Invalid configuration."
						});
					}
				});
			} else {
				if (node.driver)
					deferred.resolve(node.driver);
			}
			return deferred.promise;
		};

		this.on('close', function(closecomplete) {
			if (this.connected) {
				this.on('disconnected', function() {
					closecomplete();
				});
				node.driver.quit();
			} else {
				closecomplete();
			}
		});
	}


	RED.nodes.registerType("selenium-server", SeleniumServerSetup);

	function SeleniumOpenURLNode(n) {
		RED.nodes.createNode(this, n);
		this.name = n.name;
		this.server = n.server;
		this.weburl = n.weburl;
		this.width = n.width;
		this.height = n.height;
		this.webtitle = n.webtitle;
		this.timeout = n.timeout;
		this.maximized = n.maximized;
		this.serverObj = RED.nodes.getNode(this.server);
		var node = this;
		if (node.serverObj) {
			node.serverObj.register();
			node.serverObj.connect().then(function(webdriver) {
				node.status({
					fill : "green",
					shape : "ring",
					text : "connected"
				});
			}, function(error) {
				node.status({
					fill : "red",
					shape : "ring",
					text : "disconnected"
				});
			});
		} else {
			node.error(RED._("common.status.error"));
		}
		this.on("input", function(msg) {
			node.serverObj.connect().then(function(webdriver) {
				function setWindowSize(driver, title) {
					if (node.maximized) {
						driver.manage().window().maximize().then(function() {
							msg.driver = driver;
							msg.payload = title;
							node.send(msg);
						});
					} else {
						driver.manage().window().setSize(parseInt(node.width), parseInt(node.height)).then(function() {
							msg.driver = driver;
							msg.payload = title;
							node.send(msg);
						});
					}
					node.status({
						fill : "green",
						shape : "ring",
						text : "connected"
					});
				}

				var driver = webdriver.build();
				driver.get(node.weburl);
				if (node.webtitle) {
					driver.wait(until.titleIs(node.webtitle), parseInt(node.timeout)).catch(function(errorback) {
						node.status({
							fill : "yellow",
							shape : "ring",
							text : "unexpected"
						});
					}).then(function() {
						driver.getTitle().then(function(title) {
							setWindowSize(driver, title);
						});
					});
				} else {
					setWindowSize(driver);
				}
			}, function(error) {
				node.status({
					fill : "red",
					shape : "ring",
					text : "disconnected"
				});
			});
		});
		this.on('close', function() {
			if (node.serverConn) {
				node.serverObj.deregister();
			}
		});
	}


	RED.nodes.registerType("open-web", SeleniumOpenURLNode);

	function SeleniumCloseBrowserNode(n) {
		RED.nodes.createNode(this, n);
		this.name = n.name;
		var node = this;
		this.on("input", function(msg) {
			msg.driver.quit();
			node.send(msg);
		});
	}


	RED.nodes.registerType("close-web", SeleniumCloseBrowserNode);

	function SeleniumFindElementNode(n) {
		RED.nodes.createNode(this, n);
		this.name = n.name;
		this.selector = n.selector;
		this.timeout = n.timeout;
		this.target = n.target;
		var node = this;
		this.on("input", function(msg) {
			msg.driver.wait(until.elementLocated(By[node.selector](node.target)), parseInt(node.timeout)).catch(function(errorback) {
				if (!msg.errors) {
					msg.errors = new Array();
				}
				msg.errors.push({
					name : node.name,
					selector : node.selector,
					target : node.value,
					value : errorback
				});
				delete msg.element;
				node.status({
					fill : "red",
					shape : "ring",
					text : "unexpected"
				});
				node.send(msg);
			}).then(function() {
				msg.element = msg.driver.findElement(By[node.selector](node.target));
				node.send(msg);
			}, function(err) {

			});
		});
	}


	RED.nodes.registerType("find-object", SeleniumFindElementNode);

	function SeleniumSendKeysNode(n) {
		RED.nodes.createNode(this, n);
		this.name = n.name;
		this.keys = n.text;
		this.selector = n.selector;
		this.timeout = n.timeout;
		this.target = n.target;
		var node = this;
		this.on("input", function(msg) {
			if (node.target && node.target != "") {
				msg.driver.wait(until.elementLocated(By[node.selector](node.target)), parseInt(node.timeout)).catch(function(errorback) {
					if (!msg.errors) {
						msg.errors = new Array();
					}
					msg.errors.push({
						name : node.name,
						selector : node.selector,
						target : node.value,
						value : errorback
					});
					delete msg.element;
					node.status({
						fill : "red",
						shape : "ring",
						text : "unexpected"
					});
					node.send(msg);
				}).then(function() {
					msg.element = msg.driver.findElement(By[node.selector](node.target));
					msg.element.sendKeys(node.keys).then(function() {
						node.send(msg);
					});
				}, function(err) {
					node.send(msg);
				});
			} else {
				msg.element.sendKeys(node.keys).then(function() {
					node.send(msg);
				});
			}

		});
	}


	RED.nodes.registerType("send-keys", SeleniumSendKeysNode);

	function SeleniumClickOnNode(n) {
		RED.nodes.createNode(this, n);
		this.name = n.name;
		this.selector = n.selector;
		this.timeout = n.timeout;
		this.target = n.target;
		var node = this;
		this.on("input", function(msg) {
			if (node.target && node.target != "") {
				msg.driver.wait(until.elementLocated(By[node.selector](node.target)), parseInt(node.timeout)).catch(function(errorback) {
					if (!msg.errors) {
						msg.errors = new Array();
					}
					msg.errors.push({
						name : node.name,
						selector : node.selector,
						target : node.value,
						value : errorback
					});
					delete msg.element;
					node.status({
						fill : "red",
						shape : "ring",
						text : "unexpected"
					});
					node.send(msg);
				}).then(function() {
					msg.element = msg.driver.findElement(By[node.selector](node.target));
					msg.element.click().then(function() {
						node.send(msg);
					});
				}, function(err) {
					node.send(msg);
				});
			} else {
				msg.element.click().then(function() {
					node.send(msg);
				});
			}

		});
	}


	RED.nodes.registerType("click-on", SeleniumClickOnNode);

	function SeleniumSetValueNode(n) {
		RED.nodes.createNode(this, n);
		this.name = n.name;
		this.value = n.text;
		this.selector = n.selector;
		this.timeout = n.timeout;
		this.target = n.target;
		var node = this;
		this.on("input", function(msg) {
			if (node.target && node.target != "") {
				msg.driver.wait(until.elementLocated(By[node.selector](node.target)), parseInt(node.timeout)).catch(function(errorback) {
					if (!msg.errors) {
						msg.errors = new Array();
					}
					msg.errors.push({
						name : node.name,
						selector : node.selector,
						target : node.value,
						value : errorback
					});
					delete msg.element;
					node.status({
						fill : "red",
						shape : "ring",
						text : "unexpected"
					});
					node.send(msg);
				}).then(function() {
					msg.element = msg.driver.findElement(By[node.selector](node.target));
					msg.driver.executeScript("arguments[0].setAttribute('value', '" + node.value + "')", msg.element).then(function() {
						node.send(msg);
					});
				}, function(err) {
					node.send(msg);
				});
			} else {
				msg.driver.executeScript("arguments[0].setAttribute('value', '" + node.value + "')", msg.element).then(function() {
					node.send(msg);
				});
			}

		});
	}


	RED.nodes.registerType("set-value", SeleniumSetValueNode);

	function SeleniumGetValueNode(n) {
		RED.nodes.createNode(this, n);
		this.name = n.name;
		this.expected = n.expected;
		this.selector = n.selector;
		this.timeout = n.timeout;
		this.target = n.target;
		var node = this;
		this.on("input", function(msg) {
			if (node.target && node.target != "") {
				msg.driver.wait(until.elementLocated(By[node.selector](node.target)), parseInt(node.timeout)).catch(function(errorback) {
					if (!msg.errors) {
						msg.errors = new Array();
					}
					msg.errors.push({
						name : node.name,
						selector : node.selector,
						target : node.value,
						value : errorback
					});
					delete msg.element;
					node.status({
						fill : "red",
						shape : "ring",
						text : "unexpected"
					});
					node.send(msg);
				}).then(function() {
					msg.element = msg.driver.findElement(By[node.selector](node.target));
					try {
						msg.element.getAttribute("value").then(function(text) {
							msg.payload = text;
							if (node.expected && node.expected != "" && node.expected != text) {
								if (!msg.errors) {
									msg.errors = new Array();
								}
								getAbsoluteXPath(msg.driver, msg.element).then(function(xpath) {
									msg.errors.push({
										name : node.name,
										xpath : xpath,
										expected : node.expected,
										value : text
									});
									node.send(msg);
									node.status({
										fill : "red",
										shape : "ring",
										text : "unexpected"
									});
								});
							} else {
								node.send(msg);
								node.status({
									fill : "green",
									shape : "ring",
									text : "passed"
								});
							}
						});
					} catch (ex) {
						node.send(msg);
					}
				}, function(err) {
					node.send(msg);
				});
			} else {
				try {
					msg.element.getAttribute("value").then(function(text) {
						msg.payload = text;
						if (node.expected && node.expected != "" && node.expected != text) {
							if (!msg.errors) {
								msg.errors = new Array();
							}
							getAbsoluteXPath(msg.driver, msg.element).then(function(xpath) {
								msg.errors.push({
									name : node.name,
									xpath : xpath,
									expected : node.expected,
									value : text
								});
								node.send(msg);
								node.status({
									fill : "red",
									shape : "ring",
									text : "unexpected"
								});
							});
						} else {
							node.send(msg);
							node.status({
								fill : "green",
								shape : "ring",
								text : "passed"
							});
						}
					});
				} catch (ex) {
					node.send(msg);
				}
			}

		});
	}


	RED.nodes.registerType("get-value", SeleniumGetValueNode);

	function SeleniumGetTextNode(n) {
		RED.nodes.createNode(this, n);
		this.name = n.name;
		this.expected = n.expected;
		this.selector = n.selector;
		this.timeout = n.timeout;
		this.target = n.target;
		var node = this;
		this.on("input", function(msg) {
			if (node.target && node.target != "") {
				msg.driver.wait(until.elementLocated(By[node.selector](node.target)), parseInt(node.timeout)).catch(function(errorback) {
					if (!msg.errors) {
						msg.errors = new Array();
					}
					msg.errors.push({
						name : node.name,
						selector : node.selector,
						target : node.value,
						value : errorback
					});
					delete msg.element;
					node.status({
						fill : "red",
						shape : "ring",
						text : "unexpected"
					});
					node.send(msg);
				}).then(function() {
					msg.element = msg.driver.findElement(By[node.selector](node.target));
					try {
						msg.element.getText().then(function(text) {
							msg.payload = text;
							if (node.expected && node.expected != "" && node.expected != text) {
								if (!msg.errors) {
									msg.errors = new Array();
								}
								getAbsoluteXPath(msg.driver, msg.element).then(function(xpath) {
									msg.errors.push({
										name : node.name,
										xpath : xpath,
										expected : node.expected,
										value : text
									});
									node.send(msg);
									node.status({
										fill : "red",
										shape : "ring",
										text : "unexpected"
									});
								});
							} else {
								node.send(msg);
								node.status({
									fill : "green",
									shape : "ring",
									text : "passed"
								});
							}
						});
					} catch (ex) {
						node.send(msg);
					}
				}, function(err) {
					node.send(msg);
				});
			} else {
				try {
					msg.element.getText().then(function(text) {
						msg.payload = text;
						if (node.expected && node.expected != "" && node.expected != text) {
							if (!msg.errors) {
								msg.errors = new Array();
							}
							getAbsoluteXPath(msg.driver, msg.element).then(function(xpath) {
								msg.errors.push({
									name : node.name,
									xpath : xpath,
									expected : node.expected,
									value : text
								});
								node.send(msg);
								node.status({
									fill : "red",
									shape : "ring",
									text : "unexpected"
								});
							});
						} else {
							node.send(msg);
							node.status({
								fill : "green",
								shape : "ring",
								text : "passed"
							});
						}
					});
				} catch (ex) {
					node.send(msg);
				}
			}

		});
	}


	RED.nodes.registerType("get-text", SeleniumGetTextNode);

	function SeleniumTakeScreenshotNode(n) {
		RED.nodes.createNode(this, n);
		this.name = n.name;
		var node = this;
		this.on("input", function(msg) {
			if (msg.element) {
				msg.element.takeScreenshot().then(function(base64PNG) {
					msg.image = base64PNG;
					node.send(msg);
				});
			} else {
				node.send(msg);
			}
		});
	}


	RED.nodes.registerType("screenshot", SeleniumTakeScreenshotNode);

	function SeleniumNavToNode(n) {
		RED.nodes.createNode(this, n);
		this.name = n.name;
		this.url = n.url;
		var node = this;
		this.on("input", function(msg) {
			msg.driver.navigate().to(node.url).then(function() {
				node.send(msg);
			});
		});
	}


	RED.nodes.registerType("nav-to", SeleniumNavToNode);

	function SeleniumNavBackNode(n) {
		RED.nodes.createNode(this, n);
		this.name = n.name;
		var node = this;
		this.on("input", function(msg) {
			msg.driver.navigate().back().then(function() {
				node.send(msg);
			});
		});
	}


	RED.nodes.registerType("nav-back", SeleniumNavBackNode);

	function SeleniumNavForwardNode(n) {
		RED.nodes.createNode(this, n);
		this.name = n.name;
		var node = this;
		this.on("input", function(msg) {
			msg.driver.navigate().forward().then(function() {
				node.send(msg);
			});
		});
	}


	RED.nodes.registerType("nav-forward", SeleniumNavForwardNode);

	function SeleniumNavRefreshNode(n) {
		RED.nodes.createNode(this, n);
		this.name = n.name;
		var node = this;
		this.on("input", function(msg) {
			msg.driver.navigate().refresh().then(function() {
				node.send(msg);
			});
		});
	}


	RED.nodes.registerType("nav-refresh", SeleniumNavRefreshNode);

	function SeleniumRunScriptNode(n) {
		RED.nodes.createNode(this, n);
		this.name = n.name;
		this.func = n.func;
		var node = this;
		this.on("input", function(msg) {
			if (msg.element) {
				msg.driver.executeScript(node.func, msg.element).then(function(results) {
					msg.payload = results;
					node.send(msg);
				});
			} else {
				node.send(msg);
			}
		});
	}


	RED.nodes.registerType("run-script", SeleniumRunScriptNode);
};
