


import { ERROR_CODES } from "../../src/constants/error-codes.constants.js";
import { ReasonPhrases, StatusCodes } from "http-status-codes";

class MethodNotAllowedError extends Error {
	status: StatusCodes;
	errorCode: ERROR_CODES;
	constructor(message: string, httpStatus: StatusCodes, errorCode: ERROR_CODES) {
		super(message);
		this.name = "MethodNotAllowedError";
		this.status = httpStatus;
		this.errorCode = errorCode;
	}
}

export const methodNotAllowed = () => {
	try {
		throw new MethodNotAllowedError(ReasonPhrases.METHOD_NOT_ALLOWED, StatusCodes.METHOD_NOT_ALLOWED, ERROR_CODES.NOT_ALLOWED);
	} catch (error) {
		throw error;
	}
};

class RouteNotFoundError extends Error {
	status: StatusCodes;
	errorCode: ERROR_CODES;
	constructor(message: string, httpStatus: StatusCodes, errorCode: ERROR_CODES) {
		super(message);
		this.name = "RouteNotFoundError";
		this.status = httpStatus;
		this.errorCode = errorCode;
	}
}

export const routeNotFound = () => {
	try {
		throw new RouteNotFoundError(ReasonPhrases.NOT_FOUND, StatusCodes.NOT_FOUND, ERROR_CODES.NOT_FOUND);
	} catch (error) {
		throw error;
	}
};