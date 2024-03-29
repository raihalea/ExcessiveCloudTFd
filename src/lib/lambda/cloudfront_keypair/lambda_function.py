#!/usr/bin/env python3

import os

import boto3
import cfnresponse

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend

ssm = boto3.client("ssm")
privatekey_parameter_name = os.environ["PRIVATEKEY_PARAMETER"]

def get_parameter(parameter_name, decrypt=False):
    response = ssm.get_parameter(Name=parameter_name, WithDecryption=decrypt)
    return response["Parameter"]["Value"]

def create_public_key(parameter):
    private_key = serialization.load_pem_private_key(
        get_parameter(parameter, True).encode(),
        password=None,
        backend=default_backend(),
    )

    public_key = private_key.public_key()
    public_key_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )

    return public_key_pem.decode()


def on_create(event, context):
    public_key = create_public_key(privatekey_parameter_name)
    data = {"PublicKeyEncoded": public_key}

    cfnresponse.send(event, context, cfnresponse.SUCCESS, data, "PublicKeyEncoded")


def on_update(event, context):
    public_key = create_public_key(privatekey_parameter_name)
    data = {"PublicKeyEncoded": public_key}

    cfnresponse.send(event, context, cfnresponse.SUCCESS, data, "PublicKeyEncoded")


def on_delete(event, context):
    data = {}
    cfnresponse.send(event, context, cfnresponse.SUCCESS, data, "PublicKeyEncoded")


def handler(event, context):
    request_type = event["RequestType"]
    print(request_type)
    
    if request_type == "Create":
        on_create(event, context)
    elif request_type == "Update":
        on_update(event, context)
    elif request_type == "Delete":
        on_delete(event, context)
    else:
        raise ValueError(f"Invalid RequestType: {request_type}")
