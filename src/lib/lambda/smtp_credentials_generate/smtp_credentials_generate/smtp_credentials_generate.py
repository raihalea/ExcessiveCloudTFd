#!/usr/bin/env python3

#
# See: https://docs.aws.amazon.com/ses/latest/dg/smtp-credentials.html#smtp-credentials-convert
#

import hmac
import hashlib
import base64
import boto3
import os
import json

secret_arn = os.environ["SECRET_ARN"]
user_secretkey = os.environ["USER_SECRETKEY"]
smtp_secretkey = os.environ["SMTP_SECRETKEY"]
region = os.environ["AWS_REGION"]

sm = boto3.client("secretsmanager")

SMTP_REGIONS = [
    "us-east-2",  # US East (Ohio)
    "us-east-1",  # US East (N. Virginia)
    "us-west-2",  # US West (Oregon)
    "ap-south-1",  # Asia Pacific (Mumbai)
    "ap-northeast-2",  # Asia Pacific (Seoul)
    "ap-southeast-1",  # Asia Pacific (Singapore)
    "ap-southeast-2",  # Asia Pacific (Sydney)
    "ap-northeast-1",  # Asia Pacific (Tokyo)
    "ca-central-1",  # Canada (Central)
    "eu-central-1",  # Europe (Frankfurt)
    "eu-west-1",  # Europe (Ireland)
    "eu-west-2",  # Europe (London)
    "eu-south-1",  # Europe (Milan)
    "eu-north-1",  # Europe (Stockholm)
    "sa-east-1",  # South America (Sao Paulo)
    "us-gov-west-1",  # AWS GovCloud (US)
]

# These values are required to calculate the signature. Do not change them.
DATE = "11111111"
SERVICE = "ses"
MESSAGE = "SendRawEmail"
TERMINAL = "aws4_request"
VERSION = 0x04


def sign(key, msg):
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def calculate_key(secret_access_key, region):
    if region not in SMTP_REGIONS:
        raise ValueError(f"The {region} Region doesn't have an SMTP endpoint.")

    signature = sign(("AWS4" + secret_access_key).encode("utf-8"), DATE)
    signature = sign(signature, region)
    signature = sign(signature, SERVICE)
    signature = sign(signature, TERMINAL)
    signature = sign(signature, MESSAGE)
    signature_and_version = bytes([VERSION]) + signature
    smtp_password = base64.b64encode(signature_and_version)
    return smtp_password.decode("utf-8")


def on_create():
    secret_value_response = sm.get_secret_value(SecretId=secret_arn)
    secret_value = secret_value_response["SecretString"]
    secret_dict = json.loads(secret_value)

    smtp_secret = calculate_key(secret_dict[user_secretkey], region)

    secret_dict[smtp_secretkey] = smtp_secret

    updated_secret_value = json.dumps(secret_dict)
    sm.update_secret(SecretId=secret_arn, SecretString=updated_secret_value)

    return {"statusCode": 200, "body": "Secret updated successfully"}


def on_update():
    on_create()


def on_delete():
    return {"statusCode": 200, "body": "No action taken in on_delete"}


def handler(event, context):
    request_type = event.get("RequestType")
    if request_type == "Create":
        on_create()
    elif request_type == "Update":
        on_update()
    elif request_type == "Delete":
        on_delete()
    else:
        raise ValueError(f"Invalid RequestType: {request_type}")
