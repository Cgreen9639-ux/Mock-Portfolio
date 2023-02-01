import { logger } from "@utils/Logger";
import z from "zod";

export type StepInput = { [input: string]: any };
export type StepOutput = StepInput & { [output: string]: any };

export type StepCall<T extends StepInput, J extends StepOutput> = Omit<
  RunStepArgs<T, J>,
  "steps"
> & {
  outputs: J;
};

export abstract class Step<T extends StepInput, J extends StepOutput, PreMappedOutput> {
  name: string;
  outputMap: Partial<{ [key in keyof PreMappedOutput]: string }> | undefined;

  private inputsSchema?: z.Schema;
  private outputsSchema?: z.Schema;

  // todo: This should be put into it's own class
  // responsible for logging calls
  // Might also want to store different execution ids
  // within a chain?
  calls: Partial<StepCall<any, any>>[] = [];

  constructor(name: string, outputMap?: Partial<{ [key in keyof PreMappedOutput]: string }> | undefined) {
    this.name = name;
    this.outputMap = outputMap;
  }

  inputs(schema: z.Schema<T>) {
    this.inputsSchema = schema;
    return this;
  }

  outputs(schema: z.Schema<J>) {
    this.outputsSchema = schema;
    return this;
  }

  async run(args: UnknownRunStepArgs) {
    logger.info(`Running step: ${this.name}, with args: ${args}`);

    this.recordCall({
      inputs: args.inputs,
    });

    // validate inputs
    const inputs = this.preprocess(args.inputs);

    const outputs: any = await this._run({
      ...args,
      inputs,
    });

    const mappedOutputs = this.mapOutputs(outputs);

    // update the call with the outputs
    this.recordCall(
      {
        outputs: mappedOutputs,
      },
      true
    );

    // validate outputs and build outputs
    return this.postprocess(inputs, mappedOutputs);
  }

  /**
   * Record the calls to this step.
   *
   * @param args
   * @param updatePrev
   */
  protected recordCall(args: Partial<StepCall<any, any>>, updatePrev = false) {
    if (updatePrev) {
      if (!this.calls.length) {
        throw Error("Cannot update last call, calls length is 0");
      }

      const prev = this.calls[this.calls.length - 1];

      const call = {
        ...prev,
        ...args,
      };

      this.calls[this.calls.length - 1] = call;

      logger.debug(
        `Recorded call: ${JSON.stringify(call)} at step ${this.name}`
      );
    } else {
      this.calls.push({
        ...args,
      });

      logger.debug(
        `Recorded call: ${JSON.stringify({ ...args })} at step ${this.name}`
      );
    }
  }

  protected preprocess(inputs: any) {
    /*
    if (!this.validateInputs(inputs)) {
      throw Error(
        `Invalid inputs ${JSON.stringify(inputs)} at step ${this.name}`
      );
    }
    */

    logger.debug(`Preprocessed inputs: ${JSON.stringify(inputs)}`);

    return inputs;
  }

  protected postprocess(inputs: T, outputs: any) {
    /*
    if (!this.validateOutputs(outputs)) {
      throw Error(
        `Invalid outputs ${JSON.stringify(outputs)} at step ${this.name}`
      );
    }
    */

    logger.debug(
      `Postprocessed inputs: ${JSON.stringify(
        inputs
      )}, outputs: ${JSON.stringify(outputs)}`
    );

    return {
      ...inputs,
      ...outputs,
    };
  }

  protected abstract _run(args: RunStepArgs<T, J>): any;

  protected mapOutputs(outputs: any) {
    if (!this.outputMap) {
      return outputs;
    }

    const mapped: any = {};
    for (const [key, value] of Object.entries(outputs)) {
      // @ts-expect-error
      if (this.outputMap[key]) {
        // @ts-expect-error
        mapped[this.outputMap[key]] = value;
      } else {
        mapped[key] = value;
      }
    }
    return mapped;
  }

  serialize() {
    if (!this.calls) {
      return {};
    }

    const call = this.calls[this.calls.length - 1];

    logger.debug(
      `Serializing step: ${this.name}, call: ${JSON.stringify(call)}`
    );

    return {
      call,
      ...this._serialize(),
    };
  }
  abstract _serialize(): object;

  private validateInputs(inputs?: any): inputs is T {
    logger.debug(
      `Validating inputs: ${JSON.stringify(inputs)}, schema: ${this.inputsSchema
      }`
    );

    return this.inputsSchema?.parse(inputs);
  }
  private validateOutputs(outputs?: any): outputs is J {
    logger.debug(
      `Validating inputs: ${JSON.stringify(outputs)}, schema: ${this.inputsSchema
      }`
    );
    return this.outputsSchema?.parse(outputs);
  }
}

export type UnknownRunStepArgs = {
  steps: Step<any, any, any>[];
  inputs: any;
};

export type RunStepArgs<T extends StepInput, J extends StepOutput> = {
  steps: Step<T, J, any>[];
  inputs: T;
};
